<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Version-aware loader for core plugin files.
 *
 * This file stays UNENCODED. It selects the correct includes/core/phpXX folder
 * based on the current PHP version and requires every core file from that folder.
 *
 * Expected structure (per BUILD-GUIDE: encode once at Target PHP 8.1, then
 * copy the resulting encoded files into all folders below):
 *
 *   includes/
 *     core-loader.php          (this file, unencoded)
 *     core/
 *       php81/   (encoded files)
 *       php82/   (encoded files)
 *       php83/   (encoded files)
 *       php84/   (encoded files)
 *       php85/   (encoded files)
 *
 * PHP 8.0 is not supported and is rejected upstream by
 * wotm_environment_allows_core(). (The encoded bytecode is forward-compatible up to 8.5).
 *
 * Loader / PHP / missing-file failures do NOT call wp_die(): the storefront must keep working.
 * Admin notices and activation handling are in woocommerce-easy-order-manager.php.
 */

if (!defined('WOTM_PLUGIN_PATH')) {
    define('WOTM_PLUGIN_PATH', plugin_dir_path(dirname(__DIR__) . '/woocommerce-easy-order-manager.php'));
}

/*
 * Register plain-PHP fallback shortcode handlers at init:20, guarded by
 * WOTM_CORE_LOADED. When the encoded core fails to load for any reason
 * (loader disabled, PHP version unsupported, key bootstrap failed, encoded
 * file corrupt, etc.) the real shortcode callbacks defined inside the
 * encoded core never get registered - WordPress would then render the raw
 * bracket text like "[wotm_order_tracker]" on the frontend, which is both
 * ugly and unhelpful to the customer's visitors. This hook installs safe
 * plain-PHP stubs that return a polite "contact support" box instead. The
 * hook runs at priority 20 so any encoded-core registrations (which happen
 * at require_once time, well before init fires) take precedence when the
 * core did load successfully.
 */
if (function_exists('add_action') && !function_exists('wotm_maybe_register_fallback_shortcodes')) {
    add_action('init', 'wotm_maybe_register_fallback_shortcodes', 20);
}

if (!function_exists('wotm_maybe_register_fallback_shortcodes')) {
    /**
     * Register the fallback shortcode handlers only when the encoded core
     * did NOT finish loading. No-op on the happy path.
     */
    function wotm_maybe_register_fallback_shortcodes() {
        if (defined('WOTM_CORE_LOADED') && WOTM_CORE_LOADED) {
            return;
        }
        if (!function_exists('add_shortcode') || !function_exists('shortcode_exists')) {
            return;
        }
        $tags = ['wotm_order_tracker', 'easy_order_manager', 'wotm_inventory'];
        foreach ($tags as $tag) {
            if (!shortcode_exists($tag)) {
                add_shortcode($tag, 'wotm_fallback_shortcode_render');
            }
        }
    }
}

if (!function_exists('wotm_fallback_shortcode_render')) {
    /**
     * Render callback for the plain-PHP fallback shortcodes. Returns a
     * self-contained styled box (inline CSS, no external enqueues) so it
     * works even when the encoded core never enqueued its stylesheets.
     * Deliberately generic so it does not leak which feature is broken.
     *
     * @param array  $atts    Shortcode attributes (unused).
     * @param string $content Shortcode inner content (unused).
     * @param string $tag     The shortcode tag being rendered (unused).
     * @return string HTML fragment safe to echo into page output.
     */
    function wotm_fallback_shortcode_render($atts = [], $content = '', $tag = '') {
        $box = 'border:1px solid #d0d7de;background:#f6f8fa;color:#1f2328;'
             . 'padding:16px 20px;border-radius:8px;max-width:560px;margin:12px 0;'
             . 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;'
             . 'line-height:1.5;font-size:14px;';
        $title_style = 'display:block;margin-bottom:6px;font-size:15px;color:#1f2328;';
        $title = esc_html__('This feature is not available right now', 'woocommerce-easy-order-manager');
        $body  = esc_html__('Ask your site admin or support for help.', 'woocommerce-easy-order-manager');
        return '<div class="wotm-fallback-notice" style="' . esc_attr($box) . '">'
             . '<strong style="' . esc_attr($title_style) . '">' . $title . '</strong>'
             . $body
             . '</div>';
    }
}

/*
 * wotm_preflight_encoded_file() + wotm_preflight_php_file() live in
 * `includes/wotm-preflight.php`, loaded by the main plugin file before
 * this loader. They are guaranteed to be defined when this file runs.
 */

if (!function_exists('wotm_environment_allows_core')) {
    return;
}

$wotm_env = wotm_environment_allows_core();

/*
 * Track loader state across requests so a future admin-notice revision can
 * tell the difference between "loader was never on" (suggest install) and
 * "loader was on recently and is now off" (server-config regression -
 * suggest re-enabling). Throttled to at most one DB write per 24h per site
 * so this never becomes a hot-path write on a busy store.
 */
if (extension_loaded('ionCube Loader') && function_exists('get_option') && function_exists('update_option')) {
    $wotm_last_seen = (int) get_option('wotm_loader_last_seen', 0);
    if ($wotm_last_seen === 0 || (time() - $wotm_last_seen) > 86400) {
        update_option('wotm_loader_last_seen', time(), false);
    }
    unset($wotm_last_seen);
}

if (empty($wotm_env['ok'])) {
    if (!defined('WOTM_CORE_LOAD_FAILED')) {
        $reason = isset($wotm_env['reason']) ? (string) $wotm_env['reason'] : 'unknown';
        define('WOTM_CORE_LOAD_FAILED', $reason);
    }
    return;
}

$major = PHP_MAJOR_VERSION;
$minor = PHP_MINOR_VERSION;

// Map every supported (major, minor) pair to a folder. The bytecode encoded
// at Target PHP 7.1 is forward-compatible, so 7.1 / 7.2 / 7.3 all share the
// php71/ folder per BUILD-GUIDE step "এই ৬টা ফোল্ডার-এ copy করুন".
$folder_suffix = null;
if ($major === 8) {
    if ($minor === 1) {
        $folder_suffix = 'php81';
    } elseif ($minor === 2) {
        $folder_suffix = 'php82';
    } elseif ($minor === 3) {
        $folder_suffix = 'php83';
    } elseif ($minor === 4) {
        $folder_suffix = 'php84';
    } elseif ($minor === 5) {
        $folder_suffix = 'php85';
    }
}

if ($folder_suffix === null) {
    if (!defined('WOTM_CORE_LOAD_FAILED')) {
        define('WOTM_CORE_LOAD_FAILED', ($major === 8 && $minor === 0) ? 'php80' : 'php_unsupported');
    }
    return;
}

/*
 * §6.5.5 - Bootstrap runtime keys BEFORE any require_once on encoded files.
 *
 * wotm_bootstrap_keys_or_fail() is responsible for:
 *   1. Reading otm_license_key + otm_site_secret.
 *   2. Resolving (or fetching from OTL on cold boot / revision bump) the
 *      on-disk external-key file at WOTM_KEY_RELATIVE_PATH
 *      (wp-content/uploads/.ek/.ek by default). The loader 14.4+
 *      discovers it on its own via the relative file: path baked into the
 *      encoded bytecode - no ini_set() or runtime hook is required.
 *   3. Exposing wotm_obtain_dynamic_key_string() in global scope so the
 *      dynamic-key annotations in the encoded core can call back into PHP
 *      at decode time to compute the dynamic key literal.
 *
 * On unrecoverable failure (no license, OTL unreachable for too long, file
 * cannot be written to any storage tier) it returns false and we DO NOT
 * proceed to require encoded files - the request must continue safely with
 * the rest of WordPress / WooCommerce running. The admin notice path in the
 * main plugin file already handles short admin notices for failures.
 */
if (function_exists('wotm_bootstrap_keys_or_fail')) {
    $wotm_keys_ok = (bool) wotm_bootstrap_keys_or_fail();
    if (!$wotm_keys_ok) {
        if (!defined('WOTM_CORE_LOAD_FAILED')) {
            define('WOTM_CORE_LOAD_FAILED', 'key_bootstrap');
        }
        return;
    }
}

$core_base = WOTM_PLUGIN_PATH . 'includes/core/' . $folder_suffix . '/';

// Order respects dependencies: spine FIRST so the global spine functions
// (wotm_register_runtime, wotm_check_license_gate, wotm_verify_protected_request,
// wotm_spine_alive_check) are defined before any other encoded file is required;
// callbacks before admin-page; ajax handlers before ajax-functions; courier
// interface/classes/settings before courier-functions.
$core_files = [
    'spine.php',
    'core-plugin.php',
    'order-attribution.php',
    'shortcode.php',
    'admin-callbacks.php',
    'admin-page.php',
    'order-ajax.php',
    'product-ajax.php',
    'user-ajax.php',
    'column-ajax.php',
    'tracking-ajax.php',
    'ajax-functions.php',
    'indexer-functions.php',
    'order-blocker-functions.php',
    'fraud-checker-functions.php',
    'abandoned-cart-functions.php',
    'sms-functions.php',
    'checkout-high-rate-customers.php',
    'call-functions.php',
    'telegram-notifications.php',
    'OTM_Courier_Interface.php',
    'class-otm-courier-manager.php',
    'class-steadfast-courier.php',
    'class-pathao-courier.php',
    'class-carrybee-courier.php',
    'courier-settings.php',
    'courier-functions.php',
    'courier-status-cron.php',
    'tracking-shortcode.php',
    'invoice-generator.php',
    'print-endpoint.php',
    // After core helpers (otm_get_filtered_order_ids, otm_get_order_data, …). Encode like other core files (not spine dynamic-key).
    'zone-change-match.php',
    'smart-cron-runner.php',
    'cloudflare-webhook-sync.php',
    'cloudflare-auto-setup.php',
    'bdcourier-cf-proxy.php',
];

foreach ($core_files as $file) {
    $path = $core_base . $file;
    if (!file_exists($path)) {
        if (!defined('WOTM_CORE_LOAD_FAILED')) {
            define('WOTM_CORE_LOAD_FAILED', 'missing_core_file');
        }
        return;
    }
    // Pre-require sanity check - reject a corrupt or wrong-format encoded
    // file BEFORE require_once so the customer's site stays up even when a
    // partial/mangled upload, failed backup restore, or disk-level
    // corruption would otherwise send the request into an uncatchable
    // Decode-time fatal.
    if (!wotm_preflight_encoded_file($path)) {
        if (!defined('WOTM_CORE_LOAD_FAILED')) {
            define('WOTM_CORE_LOAD_FAILED', 'encoded_file_corrupt');
        }
        return;
    }
}
foreach ($core_files as $file) {
    require_once $core_base . $file;
}

// Inventory module: PHP files live in includes/core/{$folder_suffix}/ (same as core for php83).
$inventory_files = [
    'inventory-functions.php',
    'inventory-stock-movements.php',
    'inventory-shortcode.php',
    'inventory-ajax.php',
];
foreach ($inventory_files as $file) {
    $path = $core_base . $file;
    if (!file_exists($path)) {
        continue;
    }
    // Same preflight: inventory module is optional, but a corrupt file here
    // would still fatal the request. Skip the file silently if malformed
    // rather than dragging the whole request down - inventory features will
    // simply be unavailable, consistent with the "optional module" contract.
    if (!wotm_preflight_encoded_file($path)) {
        continue;
    }
    require_once $path;
}

if (!defined('WOTM_CORE_LOADED')) {
    define('WOTM_CORE_LOADED', true);
}
