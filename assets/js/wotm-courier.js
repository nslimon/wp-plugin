(function($) {

    var OTM_BULK_SEND_BATCH_SIZE = 10;

    function applyOtmCourierSendSuccessToRow(row, orderId, data) {
        if (data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
            WOTM_APP.applyLiveOrderRowPatch(row, data.live_row);
            return;
        }
        row.find('.otm-column-courier_status').html('<div class="flex-container"><span class="otm-courier-status-display">' + (data.new_status || 'in_review') + '</span><button class="button otm-resync-status-btn" data-order-id="' + orderId + '" style="margin-left: 5px;" title="Sync Courier Status">' + otmIcon('sync-alt') + '</button></div>');
        if (data.consignment_id !== undefined) {
            var cidCell = row.find('.otm-column-consignment_id');
            if (cidCell.find('.cell-data').length) {
                cidCell.find('.cell-data').text(data.consignment_id || '-');
            } else {
                cidCell.text(data.consignment_id || '-');
            }
        }
        if (data.courier_edit_url !== undefined) {
            var editHtml = data.courier_edit_url ? ('<a href="' + data.courier_edit_url + '" class="button" target="_blank">Edit</a>') : '<button class="button" disabled>N/A</button>';
            row.find('.otm-column-courier_edit').html(editHtml);
        }
        row.find('.otm-column-invoice').html('<button class="button otm-print-invoice-btn" data-order-id="' + orderId + '">Print</button>');
        if (data.last_modified_history && data.last_modified_history.length > 0 && typeof WOTM_APP.buildLastModifiedHtml === 'function') {
            row.find('.otm-column-last_modified').html(WOTM_APP.buildLastModifiedHtml(data.last_modified_history));
        }
        var sendButton = row.find('.otm-send-to-courier-btn');
        sendButton.replaceWith('<div class="flex-container"><button class="button" disabled>Sent</button><button class="button otm-resend-courier-btn" data-order-id="' + orderId + '" style="margin-left: 5px;" title="Resend to Courier">' + otmIcon('redo') + '</button></div>');
    }

    $(document).on('click', '.otm-send-to-courier-btn', function() {
        var button = $(this);
        var orderId = button.data('order-id');
        var row = button.closest('tr');

        button.text('Sending...').prop('disabled', true);

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_send_to_courier',
            security: WOTM_APP.ajaxNonce,
            order_id: orderId
        }, function(response) {
            if (response.success) {
                if (response.data.new_nonce && typeof WOTM_APP.updateNonce === 'function') {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                }
                WOTM_APP.showToast(response.data.message);
                applyOtmCourierSendSuccessToRow(row, orderId, response.data);
            } else {
                WOTM_APP.showToast('Error: ' + response.data.message);
            }
        }).fail(function() {
            WOTM_APP.showToast('An AJAX error occurred.');
        }).always(function() {
            button.text('Send').prop('disabled', false);
        });
    });

            // === COURIER INTEGRATION ===
            // Single order status sync
            $(document).on('click', '.otm-resync-status-btn', function() {
                var button = $(this);
                var orderId = button.data('order-id');

                button.prop('disabled', true);
                button.find('.otm-svg-icon').replaceWith(otmIcon('spinner', 'otm-spin'));

                WOTM_APP.processQueue([orderId], 'otm_sync_courier_status', button, 'Syncing');
            });

            // Bulk order status sync
            $(document).on('click', '#otm-bulk-sync-courier-status', function() {
                var button = $(this);
                var orderIdsToSync = [];
                
                // Find all orders that have a resync button, indicating they have a consignment ID
                $('.otm-resync-status-btn').each(function() {
                    var orderId = $(this).data('order-id');
                    if(orderId) {
                        orderIdsToSync.push(orderId);
                    }
                });
    
                if (orderIdsToSync.length === 0) {
                    WOTM_APP.showToast('No sent orders found on this page to sync.');
                    return;
                }

                button.prop('disabled', true);
                WOTM_APP.processQueue(orderIdsToSync, 'otm_sync_courier_status', button, 'Syncing');
            });

            // Generic sequential processor
            WOTM_APP.processQueue = function(orderIds, ajaxAction, mainButton, processingText, updateField) {
                var queue = [...orderIds]; // Clone the array
                var total = queue.length;
                var successCount = 0;
                var errorCount = 0;
                var originalButtonContent = mainButton.html();

                function processNext() {
                    if (queue.length === 0) {
                        WOTM_APP.showToast('Bulk action complete. Success: ' + successCount + ', Failed: ' + errorCount);
                        if (mainButton.is('.otm-resync-status-btn')) {
                            // Single-row sync: restore the sync icon directly
                            mainButton.html(otmIcon('sync-alt')).prop('disabled', false);
                        } else {
                            mainButton.html(originalButtonContent).prop('disabled', false);
                        }
                        return;
                    }

                    var orderId = queue.shift();
                    var row = $('tr[data-order-id="' + orderId + '"]');
                    var statusDisplay = row.find('.otm-courier-status-display');
                    var singleSyncButton = row.find('.otm-resync-status-btn');

                    if (mainButton.is('#otm-bulk-sync-courier-status')) {
                        mainButton.html(otmIcon('spinner', 'otm-spin') + ' ' + processingText + ' (' + (total - queue.length) + '/' + total + ')');
                    }
                    
                    statusDisplay.text(processingText + '...');
                    if(singleSyncButton.length > 0) {
                        singleSyncButton.prop('disabled', true).find('.otm-svg-icon').replaceWith(otmIcon('spinner', 'otm-spin'));
                    }
                    
                    var postData = {
                        action: ajaxAction,
                        security: WOTM_APP.ajaxNonce,
                        order_id: orderId,
                        order_ids: [orderId]
                    };

                    $.post(all_order_list_params.ajax_url, postData).done(function(response) {
                        if (response.success) {
                            successCount++;
                            if (response.data && response.data.new_nonce && typeof WOTM_APP.updateNonce === 'function') {
                                WOTM_APP.updateNonce(response.data.new_nonce);
                            }

                            var lrSync = response.data.live_rows && (response.data.live_rows[orderId] || response.data.live_rows[String(orderId)]);
                            if (lrSync && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                                WOTM_APP.applyLiveOrderRowPatch(row, lrSync);
                            } else if (response.data.updated_statuses && response.data.updated_statuses[orderId]) {
                                statusDisplay.text(response.data.updated_statuses[orderId]);
                            } else {
                                statusDisplay.text('Synced');
                            }

                        } else {
                            errorCount++;
                            statusDisplay.text('Error');
                            WOTM_APP.showToast('Error for order #' + orderId + ': ' + ((response.data && response.data.message) || 'Unknown error'));
                        }
                    }).fail(function() {
                        errorCount++;
                        statusDisplay.text('Failed');
                    }).always(function() {
                        if(singleSyncButton.length > 0) {
                            singleSyncButton.prop('disabled', false).find('.otm-svg-icon').replaceWith(otmIcon('sync-alt'));
                        }
                        processNext(); // Process the next item in the queue
                    });
                }

                processNext(); // Start processing the queue
            }
    
    $(document).on('click', '#otm-bulk-send-to-courier', function() {
        var button = $(this);
        button.data('original-text', button.text());
        
        var allOrderIds = [];
        $('.com-table tbody tr').each(function(){
            var orderId = $(this).data('order-id');
            if (orderId === undefined || orderId === null || orderId === '') {
                return;
            }
            var courierStatusDisplay = $(this).find('.otm-courier-status-display').text();
            var isSent = (courierStatusDisplay !== 'Not Sent' && courierStatusDisplay !== '-') && $(this).find('.otm-resend-courier-btn').length > 0;

            if (!isSent) {
                allOrderIds.push(orderId);
            }
        });

        if (allOrderIds.length === 0) {
            WOTM_APP.showToast('No unsent orders found in this tab.');
            return;
        }

        var chunks = [];
        for (var i = 0; i < allOrderIds.length; i += OTM_BULK_SEND_BATCH_SIZE) {
            chunks.push(allOrderIds.slice(i, i + OTM_BULK_SEND_BATCH_SIZE));
        }

        var total = allOrderIds.length;
        var successCount = 0;
        var errorCount = 0;
        var originalButtonContent = button.html();
        var chunkIndex = 0;

        function cumulativeThroughChunk(idx) {
            var sum = 0;
            for (var k = 0; k <= idx; k++) {
                sum += chunks[k].length;
            }
            return sum;
        }

        function processNextChunk() {
            if (chunkIndex >= chunks.length) {
                WOTM_APP.showToast('Bulk action complete. Success: ' + successCount + ', Failed: ' + errorCount);
                button.html(originalButtonContent).prop('disabled', false);
                return;
            }

            var batch = chunks[chunkIndex];
            var progressNum = cumulativeThroughChunk(chunkIndex);
            button.html(otmIcon('spinner', 'otm-spin') + ' Sending (' + progressNum + '/' + total + ')');

            batch.forEach(function(oid) {
                var row = $('tr[data-order-id="' + oid + '"]');
                row.find('.otm-courier-status-display').text('Sending...');
            });

            $.post(all_order_list_params.ajax_url, {
                action: 'otm_send_to_courier_batch',
                security: WOTM_APP.ajaxNonce,
                order_ids: batch
            }).done(function(response) {
                if (response.success && response.data) {
                    if (response.data.new_nonce && typeof WOTM_APP.updateNonce === 'function') {
                        WOTM_APP.updateNonce(response.data.new_nonce);
                    }
                    var results = response.data.results || {};
                    $.each(results, function(oidStr, r) {
                        var orderId = parseInt(oidStr, 10);
                        var row = $('tr[data-order-id="' + orderId + '"]');
                        if (r.success) {
                            successCount++;
                            applyOtmCourierSendSuccessToRow(row, orderId, r);
                        } else {
                            errorCount++;
                            row.find('.otm-courier-status-display').text('Error');
                            WOTM_APP.showToast('Error for order #' + orderId + ': ' + (r.message || 'Unknown error'));
                        }
                    });
                } else {
                    errorCount += batch.length;
                    batch.forEach(function(oid) {
                        $('tr[data-order-id="' + oid + '"] .otm-courier-status-display').text('Error');
                    });
                    WOTM_APP.showToast('Error: ' + (response.data && response.data.message ? response.data.message : 'Unknown error'));
                }
            }).fail(function() {
                errorCount += batch.length;
                batch.forEach(function(oid) {
                    $('tr[data-order-id="' + oid + '"] .otm-courier-status-display').text('Failed');
                });
                WOTM_APP.showToast('An AJAX error occurred.');
            }).always(function() {
                chunkIndex++;
                processNextChunk();
            });
        }

        button.prop('disabled', true);
        processNextChunk();
    });

    $(document).on('click', '.otm-resend-courier-btn', function() {
        var button = $(this);
        var orderId = button.data('order-id');
        var row = button.closest('tr');

        if (!confirm('Are you sure you want to resend order #' + orderId + ' to the courier?')) {
            return;
        }

        button.prop('disabled', true).find('.otm-svg-icon').replaceWith(otmIcon('spinner', 'otm-spin'));

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_send_to_courier',
            security: WOTM_APP.ajaxNonce,
            order_id: orderId
        }, function(response) {
            if (response.success) {
                if (response.data.new_nonce && typeof WOTM_APP.updateNonce === 'function') {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                }
                WOTM_APP.showToast(response.data.message);
                if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(row, response.data.live_row);
                } else {
                    if (response.data.new_status) {
                        row.find('.otm-column-courier_status').html('<div class="flex-container"><span class="otm-courier-status-display">' + response.data.new_status + '</span><button class="button otm-resync-status-btn" data-order-id="' + orderId + '" style="margin-left: 5px;" title="Sync Courier Status">' + otmIcon('sync-alt') + '</button></div>');
                    }
                    if (response.data.courier_cod !== undefined) {
                        var codCell = row.find('.otm-column-courier_cod');
                        if (codCell.find('.cell-data').length) {
                            codCell.find('.cell-data').text(parseFloat(response.data.courier_cod));
                        } else {
                            codCell.text(parseFloat(response.data.courier_cod));
                        }
                    }
                }
            } else {
                WOTM_APP.showToast('Error: ' + response.data.message);
            }
        }).fail(function() {
            WOTM_APP.showToast('An AJAX error occurred.');
        }).always(function() {
            button.prop('disabled', false).find('.otm-svg-icon').replaceWith(otmIcon('redo'));
        });
    });

})(jQuery);
