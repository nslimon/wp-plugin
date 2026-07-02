jQuery(document).ready(function($) {
    // On page load, the print status is now rendered by the server, so no JS is needed here.

    // Use event delegation for the print button click
    $(document).on('click', '#custom-print-button', function() {
        var orderIds = [];
        $('.custom-invoice-container').each(function() {
            orderIds.push($(this).data('order-id'));
        });

        if (orderIds.length === 0) {
            // No invoices to print, just trigger print for the page content if any.
            window.print();
            return;
        }

        $.ajax({
            url: invoice_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'update_print_count',
                order_ids: orderIds,
                nonce: invoice_ajax.update_print_nonce
            },
            success: function(response) {
                if (response.success) {
                    var counts = response.data.updated_counts;
                    for (var orderId in counts) {
                        if (counts.hasOwnProperty(orderId)) {
                            // Find the invoice container and update its status display
                            $('.custom-invoice-container[data-order-id="' + orderId + '"]')
                                .find('.print-status-display')
                                .text('printed ' + counts[orderId]);
                        }
                    }
                } else {
                    // Log error but proceed to print
                    console.error('Failed to update print count:', response.data);
                }
                
                // Use a short timeout to allow the DOM to update before printing
                setTimeout(function() {
                    window.print();
                }, 100);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                 // Log error but proceed to print
                console.error('AJAX error while updating print count:', textStatus, errorThrown);
                
                // Still attempt to print
                setTimeout(function() {
                    window.print();
                }, 100);
            }
        });
    });
    

});