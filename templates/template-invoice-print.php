<?php

/**
 * OTM Invoice Print Template
 *
 * This template bypasses the WordPress theme layer to provide a clean,
 * dedicated canvas for printing single or bulk invoices.
 */

if (!defined('ABSPATH')) exit;

// Security Check: Ensure the user is logged in and has the required capability.
if (!is_user_logged_in() || !current_user_can('manage_wotm_order_table')) {
    wp_die(esc_html__('You cannot open this page. Log in with an account that can manage orders.', 'woocommerce-easy-order-manager'), esc_html__('Access denied', 'woocommerce-easy-order-manager'));
}

// Resource limits for bulk printing.
@set_time_limit(120);
if (function_exists('wp_raise_memory_limit')) {
    wp_raise_memory_limit('admin');
}

global $wp_query;

// Get order IDs from query variables
$order_ids_str = $wp_query->get('order_ids', '');
$order_ids = [];
if (!empty($order_ids_str)) {
    $order_ids = array_filter(array_map('intval', explode(',', $order_ids_str)));
    $order_ids = array_values(array_unique($order_ids));
}

// Sort ascending so oldest orders (lowest ID) print first.
sort($order_ids);

// Safety cap: never render more than 100 invoices per request to prevent OOM/timeout.
$order_ids = array_slice($order_ids, 0, 100);

// Batch-load all orders in a single query (replaces N individual wc_get_order() calls).
$orders_map = [];
if (!empty($order_ids) && function_exists('wc_get_orders')) {
    $orders_raw = wc_get_orders([
        'include' => $order_ids,
        'limit'   => count($order_ids),
        'orderby' => 'none',
    ]);
    foreach ($orders_raw as $o) {
        if (is_a($o, 'WC_Order')) {
            $orders_map[$o->get_id()] = $o;
        }
    }
}

// Staff vs manager: reuse batch-loaded objects - no extra wc_get_order() calls.
if (!current_user_can('can_assign_orders')) {
    $user_id  = get_current_user_id();
    $filtered = [];
    foreach ($order_ids as $oid) {
        if ($oid <= 0) {
            continue;
        }
        $order_obj = $orders_map[$oid] ?? null;
        if (!$order_obj) {
            continue;
        }
        $assigned = (int) $order_obj->get_meta('_otm_assigned_staff', true);
        if ($assigned === $user_id) {
            $filtered[] = $oid;
        }
    }
    $order_ids = $filtered;
}

// Security check: Ensure we have IDs to process
if (empty($order_ids)) {
    wp_die('No order IDs provided for printing.');
}

// Hoist repeated get_option() calls out of the render loop.
$logo_url       = get_option('otm_invoice_logo_url');
$merchant_phone = get_option('otm_invoice_merchant_phone');

$extra_col_keys   = get_option('otm_invoice_extra_columns', []);
if (!is_array($extra_col_keys)) {
    $extra_col_keys = [];
}
$extra_col_layout = get_option('otm_invoice_extra_columns_layout', 'multiline');

// Build a key → label map for the extra columns so we can show "Label: Value" on the invoice.
$extra_col_label_map = [];
if (!empty($extra_col_keys) && function_exists('otm_get_all_possible_columns')) {
    $all_cols_for_labels      = otm_get_all_possible_columns();
    $selected_cols_for_labels = get_option('otm_columns', []);
    foreach ($extra_col_keys as $eck) {
        $eck = sanitize_key($eck);
        if (empty($eck)) {
            continue;
        }
        // Prefer user-renamed label; fall back to built-in default.
        if (isset($selected_cols_for_labels[$eck]['label']) && trim($selected_cols_for_labels[$eck]['label']) !== '') {
            $extra_col_label_map[$eck] = $selected_cols_for_labels[$eck]['label'];
        } elseif (isset($all_cols_for_labels[$eck]['label'])) {
            $extra_col_label_map[$eck] = $all_cols_for_labels[$eck]['label'];
        } else {
            $extra_col_label_map[$eck] = $eck; // fallback: use raw key
        }
    }
}

// Get required scripts and styles for the page (use plugin URL constant for robustness)
$plugin_url = defined('WOTM_PLUGIN_URL') ? WOTM_PLUGIN_URL : plugin_dir_url(dirname(__FILE__) . '/../woocommerce-easy-order-manager.php');
$jsbarcode_url = $plugin_url . 'includes/invoice-generator/assets/js/JsBarcode.all.min.js';
$jquery_url = includes_url('js/jquery/jquery.min.js');

?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Print Invoices</title>
    <style>
        /* --- On-Screen Styles --- */
        body {
            background-color: #f0f0f0;
            /* Light grey background for screen view */
        }

        .custom-invoice-container {
            font-family: sans-serif;
            padding: 5px;
            border: 1px solid #ccc;
            border-radius: 5px;
            margin: 10px auto !important;
            /* Center on screen */
            width: 75mm;
            height: 100mm;
            box-sizing: border-box;
            color: #000;
            font-size: 13px;
            position: relative;
            background-color: #fff;
        }

        .customer-note {
            border-left: 2px solid black;
            padding-left: 6px;
            padding: 10px 0 0 6px;
        }

        .product-summary {
            border-left: 2px solid black;
            padding-left: 6px;
        }

        .total-summary {
            border: 2px solid black;
            padding: 4px 6px;
            border-radius: 6px;
            margin: 15px 10px 8px 10px;
        }

        .shipping-details {
            border: 1px solid black;
            padding: 4px 6px;
            border-radius: 6px;
            margin-bottom: 15px;
            margin-top: -4px;
        }

        .qr-and-info {
            margin-bottom: 0;
            margin-top: -6px;
            display: flex;
            align-items: end;
            justify-content: space-between;
        }

        .total-label.label-field {
            border-right: 2px solid black;
            padding-right: 85px;
        }

        .invoice-cn {
            font-size: 13px;
            font-weight: bold;
            width: 72%;
            line-height: 21px;
            text-align: right;
        }

        .barcode-svg {
            width: 100%;
            height: 40px;
            margin-top: -2px;
        }

        .qrcode {
            width: 24%;
        }

        .single-line-address {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            display: block;
        }

        .invoice-courier-address {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            overflow: hidden;
            word-wrap: break-word;
            line-height: 1.25;
            white-space: normal;
            max-width: 100%;
        }

        .invoice-powered-by {
            margin-top: 10px;
            padding-top: 4px;
            text-align: right;
            font-size: 10px;
            line-height: 1.2;
            color: #aaa;
            clear: both;
        }

        @media screen {

            /* Add a separator for on-screen view of bulk invoices */
            .custom-invoice-label+.custom-invoice-label {
                border-top: 2px dotted #999;
                padding-top: 10px;
                margin-top: 20px !important;
            }
        }

        /* --- Print-Specific Styles --- */
        @media print {
            @page {
                margin: 0;
                padding: 0;
                size: 75mm 100mm;
            }

            html {
                margin: 0;
                padding: 0;
                width: 100%;
                height: auto !important;
            }

            body {
                margin: 0;
                padding: 0;
                width: 75mm;
                max-width: 100%;
                background: #fff;
                height: auto !important;
            }

            /* Fixed label canvas; footer pinned bottom-right inside box */
            .custom-invoice-label.custom-invoice-container {
                position: relative;
                margin: 0 !important;
                padding: 5px 5px 14px 5px !important;
                box-sizing: border-box;
                width: 75mm;
                height: 100mm;
                min-height: 100mm;
                max-height: 100mm;
                overflow: hidden;
                page-break-after: always;
                break-after: page;
                page-break-inside: avoid;
                break-inside: avoid;
            }

            /* :last-child fails here - <script> tags follow invoices in <body> */
            .custom-invoice-label.custom-invoice-container.invoice-label--last {
                page-break-after: auto !important;
                break-after: auto !important;
            }

            body > div.custom-invoice-label.custom-invoice-container:last-of-type {
                page-break-after: auto !important;
                break-after: auto !important;
            }

            .custom-invoice-label .total-summary {
                margin-bottom: 6px !important;
            }

            .invoice-powered-by {
                position: absolute;
                bottom: 4px;
                right: 5px;
                left: 4px;
                margin: 0;
                padding: 0;
                text-align: right;
                font-size: 9px;
                line-height: 1.15;
                color: #999;
                clear: none;
            }
        }
    </style>
</head>

<body>

    <?php
    $last_printable_order_id = null;
    foreach ($order_ids as $oid) {
        $o = $orders_map[$oid] ?? (function_exists('wc_get_order') ? wc_get_order($oid) : null);
        if ($o) {
            $last_printable_order_id = $oid;
        }
    }

    // Loop through IDs and render each invoice using the batch-loaded map.
    foreach ($order_ids as $order_id) {
        $order = $orders_map[$order_id] ?? (function_exists('wc_get_order') ? wc_get_order($order_id) : null);
        if (!$order) continue;

        $cn = $order->get_meta('_otm_courier_consignment_id', true);
        $billing_first_name = $order->get_billing_first_name();
        $billing_last_name = $order->get_billing_last_name();
        $phone = $order->get_billing_phone();
        $total_display = $order->get_total();

        $product_list = [];
        foreach ($order->get_items() as $item) {
            $name = $item->get_name();
            $qty = $item->get_quantity();
            if (isset($product_list[$name])) {
                $product_list[$name] += $qty;
            } else {
                $product_list[$name] = $qty;
            }
        }
        ksort($product_list);

        $product_line_parts = [];
        foreach ($product_list as $name => $qty) {
            $product_line_parts[] = $name . ' (' . $qty . ')';
        }
        $product_line = implode(', ', $product_line_parts);

        $address = function_exists('otm_get_courier_recipient_address_invoice_display')
            ? otm_get_courier_recipient_address_invoice_display($order)
            : trim($order->get_billing_address_1() . ($order->get_billing_address_2() ? ', ' . $order->get_billing_address_2() : ''));

        $invoice_classes = ['custom-invoice-label', 'custom-invoice-container'];
        if ($last_printable_order_id !== null && (int) $order_id === (int) $last_printable_order_id) {
            $invoice_classes[] = 'invoice-label--last';
        }

        // Start Invoice DIV
        echo '<div class="' . esc_attr(implode(' ', $invoice_classes)) . '" data-order-id="' . esc_attr($order_id) . '">';

        echo '<div class="qr-and-info">';
        echo '<div class="qrcode" style="margin-right:10px;">';
        if ($logo_url) {
            echo '<img src="' . esc_url($logo_url) . '" alt="Logo" style="max-width:100%; height:auto;">';
        }
        echo '</div>';
        echo '<div class="invoice-cn">';
        echo '<div><span class="label-field">Invoice:</span> ' . esc_html($order_id) . '</div>';
        echo '<div><span class="label-field">Parcel ID:</span> ' . esc_html($cn) . '</div>';
        if ($merchant_phone) {
            echo '<div><span class="label-field">Merchant Phone:</span> ' . esc_html($merchant_phone) . '</div>';
        }
        echo '</div>';
        echo '</div>';

        echo '<div class="barcode"><svg class="barcode-svg" data-id="' . esc_attr($cn) . '"></svg></div>';

        echo '<div class="shipping-details">';
        echo '<div class="single-line-address"><span class="label-field"><b>Name:</b></span> ' . esc_html($billing_first_name . ' ' . $billing_last_name) . '</div>';
        echo '<div><span class="label-field"><b>Phone:</b></span> ' . esc_html($phone) . '</div>';
        echo '<div class="invoice-courier-address"><span class="label-field"><b>Address:</b></span> ' . esc_html($address) . '</div>';
        echo '</div>';
        echo '<div class="product-summary"><div><span class="label-field"><b>Products:</b></span> ' . esc_html($product_line) . '</div></div>';

        // Extra invoice columns (configured on the Invoice Settings tab).
        if (!empty($extra_col_keys) && function_exists('otm_get_order_data')) {
            $extra_pairs = []; // each entry: "Label: Value" (already escaped)
            foreach ($extra_col_keys as $extra_key) {
                $extra_key = sanitize_key($extra_key);
                if (empty($extra_key)) {
                    continue;
                }
                $val = otm_get_order_data($order, $extra_key);
                // Skip: empty values, dash placeholder, or values containing HTML markup (buttons etc.).
                if (empty($val) || $val === '-') {
                    continue;
                }
                if (is_string($val) && $val !== strip_tags($val)) {
                    continue;
                }
                $col_label   = isset($extra_col_label_map[$extra_key]) ? $extra_col_label_map[$extra_key] : $extra_key;
                $extra_pairs[] = '<b>' . esc_html($col_label) . ':</b> ' . esc_html((string) $val);
            }
            if (!empty($extra_pairs)) {
                $extra_content = ($extra_col_layout === 'inline')
                    ? implode(', ', $extra_pairs)
                    : implode('<br>', $extra_pairs);
                echo '<div class="customer-note"><div>' . $extra_content . '</div></div>';
            }
        }

        $invoice_note = $order->get_meta('_otm_invoice_note', true);
        if (!empty($invoice_note)) {
            echo '<div class="customer-note"><div><span class="label-field"><b>Note:</b></span> ' . esc_html($invoice_note) . '</div></div>';
        }
        echo '<div class="total-summary" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="total-label label-field"><b>Total</b></div>
        <div class="total-value">' . esc_html($total_display) . ' Taka</div>
    </div>';

        echo '<div class="invoice-powered-by">Powered by easyordermanager.com.bd</div>';

        // End Invoice DIV
        echo '</div>';
    }
    ?>

    <script src="<?php echo esc_url($jquery_url); ?>"></script>
    <script src="<?php echo esc_url($jsbarcode_url); ?>"></script>
    <script>
        (function () {
            var printCalled = false;
            function triggerPrintOnce() {
                if (printCalled) {
                    return;
                }
                printCalled = true;
                window.print();
            }

            document.addEventListener('DOMContentLoaded', function () {
                document.querySelectorAll('.barcode-svg').forEach(function (svg) {
                    var id = svg.getAttribute('data-id');
                    if (id) {
                        try {
                            JsBarcode(svg, id, {
                                format: "CODE39",
                                displayValue: false,
                                fontSize: 0,
                                height: 40,
                                width: 3,
                                margin: 0
                            });
                        } catch (e) {}
                    }
                });

                // Two rAFs + delay: layout/paint barcodes before print (reduces race with slow devices).
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        setTimeout(triggerPrintOnce, 350);
                    });
                });
            });
        })();
    </script>

</body>

</html>