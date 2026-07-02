jQuery(document).ready(function($) {
    var trackingForm = $('#wotm-track-order-form');
    // var trackingResultsDiv = $('.wotm-ajax-results'); // This div will no longer be used for AJAX results
    var trackButton = $('#wotm-track-button');

    trackingForm.on('submit', function(e) {
        e.preventDefault();

        var orderId = $('#wotm_order_id').val().trim();
        var billingPhone = $('#wotm_billing_phone').val().trim();

        if (!orderId || !billingPhone) {
            // Use a temporary div or alert for validation errors before redirect
            alert('Please enter both Order ID and Phone Number.');
            return;
        }

        trackButton.prop('disabled', true).text('Tracking...');

        // Construct the new URL and redirect
        var currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('order_id', orderId);
        currentUrl.searchParams.set('phone', billingPhone); // Phone should be URL-encoded by the browser naturally

        window.location.href = currentUrl.toString();
    });
});