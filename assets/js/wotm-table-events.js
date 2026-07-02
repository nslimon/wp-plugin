var WOTM_APP = WOTM_APP || {};

(function ($, WOTM_APP) {

    // Duplicate Order Handler
    $(document).on('click', '.otm-duplicate-order-btn', function () {
        var button = $(this);
        var orderId = button.data('order-id');

        if (!confirm('Are you sure you want to duplicate order #' + orderId + '?')) {
            return;
        }

        button.prop('disabled', true).find('.otm-svg-icon').replaceWith(otmIcon('spinner', 'otm-spin'));

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_duplicate_order',
            security: WOTM_APP.ajaxNonce,
            order_id: orderId
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast('Order #' + orderId + ' duplicated successfully! New order is #' + response.data.new_order_id);
                WOTM_APP.loadOrders(); // Refresh the table
            } else {
                WOTM_APP.showToast('Error: ' + response.data.message);
                button.prop('disabled', false).find('.otm-svg-icon').replaceWith(otmIcon('copy'));
            }
        }).fail(function () {
            WOTM_APP.showToast('An AJAX error occurred while duplicating the order.');
            button.prop('disabled', false).find('.otm-svg-icon').replaceWith(otmIcon('copy'));
        });
    });

    // Print Invoice Handler for individual buttons (disabled until order sent to courier)
    $(document).on('click', '.otm-print-invoice-btn', function (e) {
        e.preventDefault();
        var button = $(this);
        if (button.prop('disabled')) {
            return;
        }
        var orderId = button.data('order-id');

        button.prop('disabled', true).text('Printing...');

        $.post(all_order_list_params.ajax_url, {
            action: 'update_print_count',
            nonce: all_order_list_params.update_print_nonce,
            order_ids: [orderId]
        }, function (response) {
            if (response.success && response.data.updated_counts && response.data.updated_counts[orderId]) {
                var newCount = response.data.updated_counts[orderId];
                var lrSingle = response.data.live_rows && (response.data.live_rows[orderId] || response.data.live_rows[String(orderId)]);
                if (lrSingle && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(button.closest('tr'), lrSingle);
                } else {
                    button.text('Printed ' + newCount);
                }

                // Open the print window (use home URL so it works in subdirectory / when Site URL differs from Home)
                var base = (typeof all_order_list_params !== 'undefined' && (all_order_list_params.print_invoice_base_url || all_order_list_params.home_url)) ? (all_order_list_params.print_invoice_base_url || all_order_list_params.home_url) : '/';
                var sep = base.indexOf('?') !== -1 ? '&' : '?';
                var printUrl = base.replace(/\/?$/, '') + sep + 'otm_print_invoices=1&order_ids=' + orderId;
                window.open(printUrl, '_blank');
            } else {
                WOTM_APP.showToast('Could not update print count. Please try again.');
                button.text('Print');
            }
        }).fail(function () {
            WOTM_APP.showToast('An error occurred. Please try again.');
            button.text('Print');
        }).always(function () {
            var btnAfter = $('.otm-print-invoice-btn[data-order-id="' + orderId + '"]');
            if (btnAfter.length) {
                btnAfter.prop('disabled', false);
            } else {
                button.prop('disabled', false);
            }
        });
    });

    // Bulk Print Invoices Handler
    $(document).on('click', '#otm-bulk-print-invoices', function (e) {
        e.preventDefault();

        var $bulkBtn = $(this);
        if ($bulkBtn.data('otm-print-busy')) {
            return;
        }

        var mode = $('#otm-bulk-print-mode').val() || 'unprinted';
        var printIds = [];
        var noConsignmentCount = 0;

        $('.com-table tbody tr.com-row').each(function () {
            var btn = $(this).find('.otm-print-invoice-btn');
            if (!btn.length) return;
            if (btn.prop('disabled')) {
                noConsignmentCount++;
            } else if (mode === 'all' || $.trim(btn.text()) === 'Print') {
                printIds.push(btn.data('order-id'));
            }
        });

        printIds = Array.from(new Set(printIds.map(function (id) {
            return parseInt(id, 10) || 0;
        }))).filter(function (id) {
            return id > 0;
        });

        if (noConsignmentCount > 0) {
            var msg = noConsignmentCount + ' order(s) on this page have no Consignment ID and will be skipped.\n\nClick OK to continue printing the eligible orders.';
            if (!window.confirm(msg)) {
                return;
            }
        }

        if (printIds.length === 0) {
            WOTM_APP.showToast(mode === 'all'
                ? 'No orders with a Consignment ID found on this page.'
                : 'All visible orders are already printed or have no Consignment ID.');
            return;
        }

        $bulkBtn.data('otm-print-busy', true).prop('disabled', true);

        $.post(all_order_list_params.ajax_url, {
            action: 'update_print_count',
            nonce: all_order_list_params.update_print_nonce,
            order_ids: printIds
        }, function (response) {
            if (response.success && response.data.updated_counts) {
                var counts = response.data.updated_counts;
                for (var orderId in counts) {
                    if (counts.hasOwnProperty(orderId)) {
                        var lrBulk = response.data.live_rows && (response.data.live_rows[orderId] || response.data.live_rows[String(orderId)]);
                        if (lrBulk && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                            var printRow = $('tr[data-order-id="' + orderId + '"]');
                            if (printRow.length) {
                                WOTM_APP.applyLiveOrderRowPatch(printRow, lrBulk);
                            }
                        } else {
                            var button = $('.otm-print-invoice-btn[data-order-id="' + orderId + '"]');
                            if (button.length) {
                                button.text('Printed ' + counts[orderId]);
                            }
                        }
                    }
                }
                var idsString = printIds.join(',');
                var base = (typeof all_order_list_params !== 'undefined' && (all_order_list_params.print_invoice_base_url || all_order_list_params.home_url)) ? (all_order_list_params.print_invoice_base_url || all_order_list_params.home_url) : '/';
                var sep = base.indexOf('?') !== -1 ? '&' : '?';
                var printUrl = base.replace(/\/?$/, '') + sep + 'otm_print_invoices=1&order_ids=' + idsString;
                window.open(printUrl, '_blank');
            } else {
                WOTM_APP.showToast('Could not update print counts. Please try again.');
            }
        }).fail(function () {
            WOTM_APP.showToast('An error occurred while updating print counts.');
        }).always(function () {
            $bulkBtn.data('otm-print-busy', false).prop('disabled', false);
        });
    });

    $(document).on('click', '.update-status-button', function () {
        var button = $(this);
        var orderId = button.data('order-id');
        var row = button.closest('tr');
        var status = row.find('.status-dropdown').val();

        button.prop('disabled', true);

        $.post(all_order_list_params.ajax_url, {
            action: 'update_order_address_and_status',
            security: WOTM_APP.ajaxNonce,
            order_id: orderId,
            status: status
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast('Status updated!');

                if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(row, response.data.live_row);
                } else {
                    var statusCell = row.find('.otm-column-status');
                    if (statusCell.length) {
                        var cellDataSpan = statusCell.find('.cell-data');
                        if (cellDataSpan.length) {
                            cellDataSpan.text(response.data.new_status_label);
                        } else {
                            statusCell.text(response.data.new_status_label);
                        }
                    }
                    if (response.data.last_modified_history) {
                        WOTM_APP.updateLastModifiedCell(row, response.data.last_modified_history);
                    }
                }

                row.addClass('otm-row-highlight');
                setTimeout(function () { row.removeClass('otm-row-highlight'); }, 1500);

                // If the new status doesn't match the current tab, remove the row

                if (WOTM_APP.currentTab !== 'all' && WOTM_APP.currentTab !== status) {

                    setTimeout(function () {

                        row.fadeOut(400, function () {

                            $(this).remove();

                        });

                    }, 1500); // Wait for highlight to finish

                }



            } else {
                WOTM_APP.showToast('Error: ' + response.data);
            }
        }).fail(function () {
            WOTM_APP.showToast('AJAX request failed.');
        }).always(function () {
            button.prop('disabled', false);
        });
    });

    // Block button click handler
    $(document).on('click', '.block-button', function () {
        var button = $(this);
        var orderId = button.data('order-id');
        var phone1 = button.data('phone1');
        var email = button.data('email');
        var messageDiv = button.next('.block-message');

        button.prop('disabled', true).text('Blocking...');
        messageDiv.text('').css('color', '');

        $.post(all_order_list_params.ajax_url, {
            action: 'block_order_phones',
            security: WOTM_APP.ajaxNonce,
            order_id: orderId,
            phone1: phone1,
            email: email
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                messageDiv.text(response.data.message).css('color', 'green');
                var rowBlock = button.closest('tr');
                if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(rowBlock, response.data.live_row);
                } else {
                    button.replaceWith('<button class="unblock-button" data-order-id="' + orderId + '" data-phone1="' + phone1 + '" data-email="' + email + '">Unblock</button>');
                }
            } else {
                messageDiv.text('Error: ' + response.data).css('color', 'red');
                button.prop('disabled', false).text('Block');
            }
            setTimeout(function () { messageDiv.text('').css('color', ''); }, 2000);
        }).fail(function () {
            messageDiv.text('AJAX failed').css('color', 'red');
            button.prop('disabled', false).text('Block');
        });
    });

    // Unblock button click handler
    $(document).on('click', '.unblock-button', function () {
        var button = $(this);
        var orderId = button.data('order-id');
        var phone1 = button.data('phone1');
        var email = button.data('email');
        var messageDiv = button.next('.block-message');

        button.prop('disabled', true).text('Unblocking...');
        messageDiv.text('').css('color', '');

        $.post(all_order_list_params.ajax_url, {
            action: 'unblock_order_phones',
            security: WOTM_APP.ajaxNonce,
            order_id: orderId,
            phone1: phone1,
            email: email
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                messageDiv.text(response.data.message).css('color', 'green');
                var rowUnblock = button.closest('tr');
                if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(rowUnblock, response.data.live_row);
                } else {
                    button.replaceWith('<button class="block-button" data-order-id="' + orderId + '" data-phone1="' + phone1 + '" data-email="' + email + '">Block</button>');
                }
            } else {
                messageDiv.text('Error: ' + response.data).css('color', 'red');
                button.prop('disabled', false).text('Unblock');
            }
            setTimeout(function () { messageDiv.text('').css('color', ''); }, 2000);
        }).fail(function () {
            messageDiv.text('AJAX failed').css('color', 'red');
            button.prop('disabled', false).text('Unblock');
        });
    });

    // Row select on click
    $(document).on('click', '.com-table tbody tr', function (e) {
        if ($(e.target).is('input, a, button, select, textarea') || $(e.target).closest('.product-editor, .check-d-button').length) {
            return;
        }
        var order_checkbox = $(this).find('.order-checkbox');
        var assignee_checkbox = $(this).find('.assignee-checkbox');

        var is_checked = !order_checkbox.prop('checked');

        order_checkbox.prop('checked', is_checked);
        assignee_checkbox.prop('checked', is_checked);

        $(this).toggleClass('selected', is_checked);
    });

    // Also toggle class when checkbox is clicked directly
    $(document).on('click', '.order-checkbox', function (e) {
        $(this).closest('tr').toggleClass('selected', $(this).prop('checked'));
    });

    // Select All Checkbox
    $(document).on('click', '#select-all-orders', function () {
        var isChecked = $(this).prop('checked');
        $('.order-checkbox').prop('checked', isChecked);
        $('.com-table tbody tr').toggleClass('selected', isChecked);
    });

    // Bulk Update Button
    $(document).on('click', '#bulk-update-status-button', function () {
        var button = $(this);
        var status = $('#bulk-status-dropdown').val();
        var orderIds = [];
        $('.order-checkbox:checked').each(function () {
            orderIds.push($(this).val());
        });

        if (!status) {
            WOTM_APP.showToast('Please select a status for bulk update.');
            return;
        }

        if (orderIds.length === 0) {
            WOTM_APP.showToast('Please select at least one order to update.');
            return;
        }

        button.prop('disabled', true).text('Updating...');

        $.post(all_order_list_params.ajax_url, {
            action: 'bulk_update_order_status',
            security: WOTM_APP.ajaxNonce,
            order_ids: orderIds,
            status: status
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast(response.data.message);
                WOTM_APP.loadOrders(); // Reload the table
            } else {
                WOTM_APP.showToast('Error: ' + response.data);
            }
            button.prop('disabled', false).text('Update');
        }).fail(function () {
            WOTM_APP.showToast('An AJAX error occurred.');
            button.prop('disabled', false).text('Update');
        });
    });

    // Note textarea handling
    $(document).on('keydown', '.note-textarea', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            var textarea = $(this);
            var orderId = textarea.data('order-id');
            var metaKey = textarea.data('meta-key');
            var value = textarea.val();

            var data = {
                action: metaKey ? 'update_order_meta_field' : 'update_order_note',
                security: WOTM_APP.ajaxNonce,
                order_id: orderId,
            };

            if (metaKey) {
                data.meta_key = metaKey;
                data.meta_value = value;
            } else {
                data.note = value;
            }

            $.post(all_order_list_params.ajax_url, data, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    WOTM_APP.showToast('Note updated successfully.');
                    const noteCell = textarea.closest('td');
                    const row = noteCell.closest('tr');
                    row.addClass('otm-row-highlight');
                    setTimeout(function () { row.removeClass('otm-row-highlight'); }, 1500);

                    if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                        WOTM_APP.applyLiveOrderRowPatch(row, response.data.live_row);
                    } else {
                        if (response.data.last_modified_history) {
                            WOTM_APP.updateLastModifiedCell(row, response.data.last_modified_history);
                        }
                        if (metaKey) {
                            textarea.prop('readonly', true);
                        } else {
                            const newHistory = response.data.new_history;
                            const latestNote = newHistory[0];
                            let historyHtml = '';
                            newHistory.forEach(noteEntry => {
                                const noteDate = new Date(noteEntry.time);
                                const formattedDate = ('0' + noteDate.getDate()).slice(-2) + '-' + ('0' + (noteDate.getMonth() + 1)).slice(-2) + '-' + noteDate.getFullYear() + ' ' + ('0' + noteDate.getHours()).slice(-2) + ':' + ('0' + noteDate.getMinutes()).slice(-2);
                                historyHtml += '<p><strong>' + noteEntry.user + '</strong> (' + formattedDate + '):<br>' + noteEntry.note.replace(/\n/g, '<br>') + '</p>';
                            });
                            const newDisplayHtml = '<div class="note-display">' +
                                '<div class="tracking-accordion">' +
                                '<button class="accordion"><span class="accordion-text">' + (latestNote.note || '') + '</span></button>' +
                                '<div class="panel" style="display:none;">' + historyHtml + '</div>' +
                                '</div>' +
                                '</div>';
                            const newCellContent = newDisplayHtml + '<span class="edit-note-button edit-cell-icon">' + otmIcon('pencil-alt', 'otm-icon') + '</span>';
                            noteCell.html(newCellContent);
                            noteCell.find('.accordion').on('click', function () {
                                $(this).toggleClass('active');
                                $(this).next('.panel').toggle();
                            });
                        }
                    }
                } else {
                    WOTM_APP.showToast('Update failed.');
                }
            });
        }
    });

    $(document).on('click', '.note-textarea', function () {
        $(this).prop('readonly', false).focus();
    });

    // Update button click handler
    $(document).on('click', '.update-status-button', function () {
        var button = $(this);
        var row = button.closest('tr');
        var orderId = row.data('order-id');

        row.find('.note-textarea').each(function () {
            var textarea = $(this);
            var metaKey = textarea.data('meta-key');
            var value = textarea.val();

            var data = {
                action: metaKey ? 'update_order_meta_field' : 'update_order_note',
                security: WOTM_APP.ajaxNonce,
                order_id: orderId,
            };

            if (metaKey) {
                data.meta_key = metaKey;
                data.meta_value = value;
            } else {
                data.note = value;
            }

            $.post(all_order_list_params.ajax_url, data, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                        WOTM_APP.applyLiveOrderRowPatch(row, response.data.live_row);
                    } else {
                        textarea.prop('readonly', true);
                    }
                } else {
                    WOTM_APP.showToast('Update failed for ' + (metaKey || 'note'));
                }
            });
        });
    });

    $(document).on('click', '.edit-note-button', function () {
        var icon = $(this);
        var noteCell = icon.closest('td');
        var displayWrapper = noteCell.find('.note-display');
        var orderId = noteCell.closest('tr').data('order-id');
        var currentNoteText = '';

        var accordionButton = displayWrapper.find('.tracking-accordion .accordion');
        if (accordionButton.length > 0) {
            currentNoteText = accordionButton.text();
        } else {
            var noteDiv = displayWrapper.find('.latest-note');
            currentNoteText = noteDiv.clone().find('br').replaceWith('\n').end().text();
        }

        var textarea = '<textarea class="note-textarea width-100" data-order-id="' + orderId + '" rows="4">' + currentNoteText + '</textarea>';

        displayWrapper.hide();
        icon.hide();
        noteCell.append(textarea);

        // Focus the textarea, move cursor to the end, and scroll to the end
        var textareaField = noteCell.find('.note-textarea');
        textareaField.focus();
        var tmpStr = textareaField.val();
        textareaField.val('');
        textareaField.val(tmpStr);
        textareaField[0].scrollLeft = textareaField[0].scrollWidth; // Scroll to the end
    });

    // Product Editing Logic
    $(document).on('click', '.edit-products-button', function () {
        var cell = $(this).closest('.product-cell');
        var row = $(this).closest('tr');
        var orderId = row.data('order-id');
        var abandonedCartId = row.data('abandoned-cart-id');
        var selectedProductsDiv = cell.find('.selected-products');

        selectedProductsDiv.html('<div>Loading products...</div>');
        cell.addClass('editing-products');
        cell.find('.product-display, .edit-products-button').hide();
        cell.find('.product-editor').show();

        var action = abandonedCartId ? 'otm_get_abandoned_cart_products' : 'otm_get_order_products_for_edit';
        var postData = { action: action, security: WOTM_APP.ajaxNonce };
        if (abandonedCartId) {
            postData.abandoned_cart_id = abandonedCartId;
        } else {
            postData.order_id = orderId;
        }

        $.post(all_order_list_params.ajax_url, postData, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                selectedProductsDiv.empty();
                (response.data.products || []).forEach(function (product) {
                    if (!product || !product.id) return;
                    var name = product.name || ('#' + product.id);
                    var qty = product.quantity || 1;
                    var productHtml = '<div class="selected-product-item" data-product-id="' + product.id + '">' +
                        '<span>' + name + '</span>' +
                        '<input type="number" class="product-quantity" value="' + qty + '" min="1" style="width: 60px; margin: 0 5px;">' +
                        '<button class="remove-product-button">X</button>' +
                        '</div>';
                    selectedProductsDiv.append(productHtml);
                });
            } else {
                selectedProductsDiv.html('<div>Error loading products.</div>');
            }
        }).fail(function () {
            selectedProductsDiv.html('<div>Error loading products.</div>');
        });
    });

    $(document).on('click', '.cancel-edit-products-button', function () {
        var cell = $(this).closest('.product-cell');
        cell.removeClass('editing-products');
        cell.find('.product-editor').hide();
        cell.find('.product-display, .edit-products-button').show();
        cell.find('.product-search-input').val('');
        cell.find('.selected-products').empty();
        cell.find('.product-suggestions').empty().hide();
    });

    var productSearchTimeout;
    $(document).on('input', '.product-search-input', function () {
        var input = $(this);
        var suggestionsDiv = input.siblings('.product-suggestions');
        var term = input.val().trim();

        clearTimeout(productSearchTimeout);

        if (term.length < 2) {
            suggestionsDiv.hide().empty();
            return;
        }

        productSearchTimeout = setTimeout(function () {
            $.post(all_order_list_params.ajax_url, {
                action: 'search_products',
                security: WOTM_APP.ajaxNonce,
                term: term
            }, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    var html = '<ul>';
                    response.data.products.forEach(function (product) {
                        if (!product || !product.id || !product.text) return;
                        html += '<li data-product-id="' + product.id + '">' + product.text + '</li>';
                    });
                    html += '</ul>';
                    suggestionsDiv.html(html).show();
                } else {
                    suggestionsDiv.hide().empty();
                }
            });
        }, 300);
    });

    $(document).on('click', '.product-suggestions li', function () {
        var selectedLi = $(this);
        var productId = selectedLi.data('product-id');
        var productName = selectedLi.text();
        var cell = selectedLi.closest('.product-cell');
        var selectedProductsDiv = cell.find('.selected-products');

        if (selectedProductsDiv.find('.selected-product-item[data-product-id="' + productId + '"]').length > 0) {
            WOTM_APP.showToast('Product already added.');
            return;
        }

        var productHtml = '<div class="selected-product-item" data-product-id="' + productId + '">' +
            '<span>' + productName + '</span>' +
            '<input type="number" class="product-quantity" value="1" min="1" style="width: 60px; margin: 0 5px;">' +
            '<button class="remove-product-button">X</button>' +
            '</div>';

        selectedProductsDiv.append(productHtml);

        // Clear input and hide suggestions
        cell.find('.product-search-input').val('');
        cell.find('.product-suggestions').hide().empty();
    });

    $(document).on('click', '.remove-product-button', function () {
        $(this).closest('.selected-product-item').remove();
    });

    $(document).on('click', '.update-products-button', function () {
        var button = $(this);
        var orderId = button.data('order-id');
        var abandonedCartId = button.data('abandoned-cart-id');
        var cell = button.closest('.product-cell');
        var selectedProductsDiv = cell.find('.selected-products');
        var products = [];

        selectedProductsDiv.find('.selected-product-item').each(function () {
            products.push({
                id: $(this).data('product-id'),
                quantity: $(this).find('.product-quantity').val()
            });
        });

        if (products.length === 0) {
            WOTM_APP.showToast('Please select at least one product.');
            return;
        }

        button.prop('disabled', true).text('Updating...');

        var action = abandonedCartId ? 'otm_update_abandoned_cart_products' : 'update_order_products';
        var postData = {
            action: action,
            security: WOTM_APP.ajaxNonce,
            products: products
        };
        if (abandonedCartId) {
            postData.abandoned_cart_id = abandonedCartId;
        } else {
            postData.order_id = orderId;
        }

        $.post(all_order_list_params.ajax_url, postData, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                var row = button.closest('tr');
                cell.removeClass('editing-products');
                if (!abandonedCartId && response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(row, response.data.live_row);
                } else {
                    cell.find('.product-display').html(response.data.new_product_list || '');
                    var totalCell = row.find('.otm-column-order_total, .otm-column-cart_total');
                    var sym = all_order_list_params.currency_symbol || '';
                    if (totalCell.find('.cell-data').length > 0) {
                        totalCell.find('.cell-data').text(sym + response.data.new_total);
                    } else {
                        totalCell.text(sym + response.data.new_total);
                    }
                    if (response.data.last_modified_history) {
                        WOTM_APP.updateLastModifiedCell(row, response.data.last_modified_history);
                    }
                }
                cell.find('.product-editor').hide();
                cell.find('.product-display, .edit-products-button').show();
                cell.find('.product-search-input').val('');
                cell.find('.selected-products').empty();
                WOTM_APP.showToast('Products updated successfully!');
                row.addClass('otm-row-highlight');
                setTimeout(function () { row.removeClass('otm-row-highlight'); }, 1500);
            } else {
                WOTM_APP.showToast('Error updating products: ' + (response.data || ''));
            }
        }).fail(function () {
            WOTM_APP.showToast('An AJAX error occurred.');
        }).always(function () {
            button.prop('disabled', false).text('Update');
        });
    });

    var resizing = false;
    var currentTh;
    var startOffset;
    var resizerTable;
    var resizerColIndex;

    $(document).on('mousedown', '.resizer', function (e) {
        if ($(this).closest('#otm-inventory-table-container').length) return;
        e.stopPropagation();
        resizing = true;
        currentTh = $(this).closest('th');
        resizerTable = currentTh.closest('table');
        resizerColIndex = currentTh.index();
        startOffset = currentTh.width() - e.pageX;
    });

    $(document).on('mousemove', function (e) {
        if (resizing) {
            e.stopPropagation();
            var newWidth = Math.max(20, startOffset + e.pageX);
            currentTh.width(newWidth);
            if (resizerTable && resizerTable.hasClass('com-table-abandoned')) {
                resizerTable.find('tbody tr').each(function () {
                    $(this).find('td').eq(resizerColIndex).width(newWidth);
                });
            }
        }
    });

    $(document).on('mouseup', function (e) {
        if (resizing) {
            resizing = false;
            var finalWidth = Math.round(currentTh.width());
            var colKey = currentTh.data('key');
            var table = currentTh.closest('table');
            var isAbandonedCart = table.hasClass('com-table-abandoned') || table.find('tr[data-abandoned-cart-id]').length > 0;
            var postData = {
                action: 'otm_save_column_width',
                security: WOTM_APP.ajaxNonce,
                col_key: colKey,
                width: finalWidth
            };
            if (isAbandonedCart) {
                postData.context = 'abandoned_cart';
            }

            $.post(all_order_list_params.ajax_url, postData, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    if (!isAbandonedCart && typeof WOTM_APP.updateOrdersTableScrollWidth === 'function') {
                        WOTM_APP.updateOrdersTableScrollWidth();
                    }
                } else {
                    WOTM_APP.showToast('Error saving column width.');
                }
            });
        }
    });

    // --- ZONE SELECTION LOGIC ---
    var currentZoneCell = null;
    var currentCityKey = null;

    // Show city list when focusing the input (table zone column only; Bulk SMS and Filter dropdown use drill-down below)
    $(document).on('focus', '.zone-search-input', function () {
        var input = $(this);
        if (input.closest('#bulk-sms-dropdown').length || input.closest('#filter-dropdown').length) return;
        currentZoneCell = input.closest('td');
        var dropdown = currentZoneCell.find('.zone-dropdown');

        WOTM_APP.populateCityList(dropdown, '');
        dropdown.show();
    });

    // Handle typing in the search input
    $(document).on('input', '.zone-search-input', function () {
        var input = $(this);
        if (input.closest('#bulk-sms-dropdown').length || input.closest('#filter-dropdown').length) return;
        var dropdown = input.siblings('.zone-dropdown');
        var searchTerm = input.val().toLowerCase();

        if (currentCityKey) {
            WOTM_APP.populateZoneList(dropdown, searchTerm);
        } else {
            WOTM_APP.populateCityList(dropdown, searchTerm);
        }
    });

    // Handle clicking a city
    $(document).on('click', '.zone-dropdown .city-item', function () {
        if ($(this).closest('#bulk-sms-dropdown').length || $(this).closest('#filter-dropdown').length) return;
        currentCityKey = $(this).data('city-key');
        var dropdown = $(this).closest('.zone-dropdown');
        WOTM_APP.populateZoneList(dropdown, '');
        currentZoneCell.find('.zone-search-input').focus();
    });

    // Handle clicking the "back" button
    $(document).on('click', '.zone-dropdown .zone-back-btn', function () {
        if ($(this).closest('#bulk-sms-dropdown').length || $(this).closest('#filter-dropdown').length) return;
        currentCityKey = null;
        var dropdown = $(this).closest('.zone-dropdown');
        WOTM_APP.populateCityList(dropdown, '');
        currentZoneCell.find('.zone-search-input').focus();
    });



    // --- ZONE AUTO-DETECT WAND LOGIC ---
    WOTM_APP.injectZoneWand = function() {
        $('.zone-selector-container').each(function() {
            if ($(this).closest('.filter-dropdown').length > 0) {
                return; // Skip for filter/bulk-sms modals
            }
            if ($(this).find('.zone-magic-wand').length === 0) {
                $(this).css('position', 'relative');
                $(this).find('.zone-search-input').css('padding-right', '28px');
                var iconHtml = (typeof window.otmIcon === 'function') ? window.otmIcon('map-marker-alt') : 'Auto';
                var btn = $('<button class="zone-magic-wand" title="Auto Detect Zone" style="position: absolute; right: 2px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; line-height: 1; z-index: 10; color: #007cba;">' + iconHtml + '</button>');
                $(this).append(btn);
            }
        });
    };

    $(document).ready(function() {
        WOTM_APP.injectZoneWand();
    });

    $(document).ajaxComplete(function() {
        WOTM_APP.injectZoneWand();
    });

    $(document).on('click', '.zone-magic-wand', function(e) {
        e.preventDefault();
        e.stopPropagation();

        var container = $(this).closest('.zone-selector-container');
        var row = container.closest('tr');
        var input = container.find('.zone-search-input');
        var dropdown = container.find('.zone-dropdown');

        currentZoneCell = input.closest('td');
        currentZoneInput = input;

        var shippingAddr1 = row.find('.otm-column-shipping_address_1 .cell-data').text().trim();
        var shippingAddr2 = row.find('.otm-column-shipping_address_2 .cell-data').text().trim();
        var abandonedAddr = row.find('.otm-column-address .cell-data').text().trim();
        var shippingAddr = (shippingAddr1 + ' ' + shippingAddr2).trim() || abandonedAddr;

        var billingAddr1 = row.find('.otm-column-billing_address_1 .cell-data').text().trim();
        var billingAddr2 = row.find('.otm-column-billing_address_2 .cell-data').text().trim();
        var billingAddr = (billingAddr1 + ' ' + billingAddr2).trim();

        var addressText = shippingAddr || billingAddr;

        if (typeof window.WOTM_GetZoneSuggestions === 'function' && addressText) {
            var suggestions = window.WOTM_GetZoneSuggestions(addressText);
            var html = '<ul>';
            
            if (suggestions && suggestions.length > 0) {
                var headerIcon = (typeof window.otmIcon === 'function') ? window.otmIcon('map-marker-alt') : '';
                html += '<li style="padding: 5px 10px; font-size: 11px; background: #e0f7fa; color: #006064; font-weight: bold; border-bottom: 1px solid #b2ebf2; cursor: default;">' + headerIcon + ' Auto Detect Suggestions</li>';
                suggestions.forEach(function(sug) {
                    html += '<li class="zone-item" data-value="' + sug.cityId + '|' + sug.id + '" data-display="' + sug.text + '"><strong>' + sug.text + '</strong></li>';
                });
            } else {
                html += '<li class="otm-zone-empty-msg">No confident match found. Please select manually.</li>';
            }
            html += '<li class="zone-back-btn" style="border-top: 1px solid #ddd; margin-top: 5px;">&laquo; Back to Cities</li>';
            html += '</ul>';
            
            dropdown.html(html).show();
            currentCityKey = null; // Reset drill down state
        } else {
            WOTM_APP.showToast('Please wait for the script to load or ensure an address exists.');
        }
    });

    // Hide dropdown when clicking outside
    $(document).on('click', function (e) {
        if (currentZoneCell && !currentZoneCell.is(e.target) && currentZoneCell.has(e.target).length === 0) {
            currentZoneCell.find('.zone-dropdown').hide();
            currentCityKey = null;
            currentZoneCell = null;
        }
    });

    WOTM_APP.populateCityList = function (dropdown, searchTerm) {
        var html = '<ul>';
        if ($.isEmptyObject(WOTM_APP.courierZones)) {
            html += '<li class="otm-zone-empty-msg">No courier selected. To show zones, go to <strong>Easy Order Manager &rarr; Courier</strong> and select <strong>Steadfast</strong> or <strong>Pathao</strong> under Courier Selection.</li>';
        } else {
            for (var cityKey in WOTM_APP.courierZones) {
                var cityName = cityKey.split(',')[1];
                if (cityName && cityName.toLowerCase().includes(searchTerm)) {
                    html += '<li class="city-item" data-city-key="' + encodeURIComponent(cityKey) + '">' + cityName + '</li>';
                }
            }
        }
        html += '</ul>';
        dropdown.html(html);
    }

    WOTM_APP.populateZoneList = function (dropdown, searchTerm) {
        var zones = WOTM_APP.courierZones[decodeURIComponent(currentCityKey)];
        var html = '<ul>';
        html += '<li class="zone-back-btn">&laquo; Back to Cities</li>';
        if (zones) {
            zones.forEach(function (zoneKey) {
                var zoneName = zoneKey.split(',')[1];
                if (zoneName && zoneName.toLowerCase().includes(searchTerm)) {
                    html += '<li class="zone-item" data-zone-key="' + encodeURIComponent(zoneKey) + '">' + zoneName + '</li>';
                }
            });
        }
        html += '</ul>';
        dropdown.html(html);
    }
    // --- END ZONE SELECTION LOGIC ---

    function removeCellDataInputEditor(input) {
        if (!input || !input.length) {
            return;
        }
        var cell = input.closest('.editable-cell');
        var dataSpan = cell.find('.cell-data');
        var icon = cell.find('.edit-cell-icon');
        dataSpan.show();
        icon.show();
        cell.find('.phone-country-code').remove();
        cell.removeData('otm-commit-initial');
        input.removeData('otm-save-in-flight');
        input.remove();
    }

    function otmEscapeAttr(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function otmResolveCountryCode(rawOrLabel) {
        var value = String(rawOrLabel == null ? '' : rawOrLabel).trim();
        if (!value) return '';
        var countries = (all_order_list_params && all_order_list_params.wc_countries) ? all_order_list_params.wc_countries : {};
        if (Object.prototype.hasOwnProperty.call(countries, value)) {
            return value;
        }
        var lower = value.toLowerCase();
        for (var code in countries) {
            if (!Object.prototype.hasOwnProperty.call(countries, code)) continue;
            if (String(countries[code]).toLowerCase() === lower) {
                return code;
            }
        }
        return '';
    }

    function otmResolveCountryCodeFromRow(row, key) {
        var countryKey = (key === 'shipping_state' || key === 'shipping_country') ? 'shipping_country' : 'billing_country';
        var countryText = row.find('.otm-column-' + countryKey + ' .cell-data').first().text();
        return otmResolveCountryCode(countryText);
    }

    function otmBuildCountrySelectHtml(currentData) {
        var countries = (all_order_list_params && all_order_list_params.wc_countries) ? all_order_list_params.wc_countries : {};
        var selectedCode = otmResolveCountryCode(currentData);
        var html = '<select class="cell-data-input cell-data-select">';
        html += '<option value="">-</option>';
        for (var code in countries) {
            if (!Object.prototype.hasOwnProperty.call(countries, code)) continue;
            var selected = (selectedCode === code) ? ' selected' : '';
            html += '<option value="' + otmEscapeAttr(code) + '"' + selected + '>' + otmEscapeAttr(countries[code]) + '</option>';
        }
        if (!selectedCode && String(currentData || '').trim() !== '') {
            var fallback = String(currentData).trim();
            html += '<option value="' + otmEscapeAttr(fallback) + '" selected>' + otmEscapeAttr(fallback) + '</option>';
        }
        html += '</select>';
        return { html: html, initialValue: selectedCode || String(currentData || '').trim() };
    }

    function otmBuildStateSelectHtml(row, key, currentData) {
        var statesByCountry = (all_order_list_params && all_order_list_params.wc_states) ? all_order_list_params.wc_states : {};
        var countryCode = otmResolveCountryCodeFromRow(row, key);
        var states = (countryCode && statesByCountry[countryCode]) ? statesByCountry[countryCode] : null;
        if (!states || typeof states !== 'object' || Object.keys(states).length === 0) {
            return null;
        }
        var current = String(currentData == null ? '' : currentData).trim();
        var selectedStateCode = '';
        if (Object.prototype.hasOwnProperty.call(states, current)) {
            selectedStateCode = current;
        } else {
            var lower = current.toLowerCase();
            for (var stCode in states) {
                if (!Object.prototype.hasOwnProperty.call(states, stCode)) continue;
                if (String(states[stCode]).toLowerCase() === lower) {
                    selectedStateCode = stCode;
                    break;
                }
            }
        }
        var html = '<select class="cell-data-input cell-data-select">';
        html += '<option value="">-</option>';
        for (var code in states) {
            if (!Object.prototype.hasOwnProperty.call(states, code)) continue;
            var selected = (selectedStateCode === code) ? ' selected' : '';
            html += '<option value="' + otmEscapeAttr(code) + '"' + selected + '>' + otmEscapeAttr(states[code]) + '</option>';
        }
        if (!selectedStateCode && current !== '') {
            html += '<option value="' + otmEscapeAttr(current) + '" selected>' + otmEscapeAttr(current) + '</option>';
        }
        html += '</select>';
        return { html: html, initialValue: selectedStateCode || current };
    }

    function commitCellDataInput(input) {
        var cell = input.closest('.editable-cell');
        var row = cell.closest('tr');
        var orderId = row.data('order-id');
        var abandonedCartId = row.data('abandoned-cart-id');
        var key = cell.data('key');
        var newValue = input.val();

        if (key === 'zone_match_ref') {
            var zoneCell = cell.closest('.otm-zone-match-cell');
            var zoneOid = parseInt(zoneCell.data('zone-order-id'), 10);
            /* Pen save always "manual" so server keeps this pair across match recompute (unique Ready ↔ one Zone). */
            var kind = 'manual';
            var rawDigits = String(newValue == null ? '' : newValue).replace(/\D/g, '');
            var refId = parseInt(rawDigits, 10);
            if (!refId) {
                refId = 0;
            }
            var initialCommit = cell.data('otm-commit-initial');
            var initialStr = initialCommit == null ? '' : String(initialCommit).replace(/\D/g, '');
            var initialRef = parseInt(initialStr, 10);
            if (!initialRef) {
                initialRef = 0;
            }
            if (refId === initialRef) {
                removeCellDataInputEditor(input);
                return;
            }
            if (!zoneOid) {
                removeCellDataInputEditor(input);
                return;
            }
            if (input.data('otm-save-in-flight')) {
                return;
            }
            input.data('otm-save-in-flight', true);
            var finishZm = function () {
                input.removeData('otm-save-in-flight');
            };
            var zmFilters = {};
            var zmSearch = '';
            if (typeof WOTM_APP !== 'undefined' && WOTM_APP.lastOrdersFetchParams) {
                zmFilters = WOTM_APP.lastOrdersFetchParams.filters || {};
                if (WOTM_APP.lastOrdersFetchParams.search != null && WOTM_APP.lastOrdersFetchParams.search !== '') {
                    zmSearch = WOTM_APP.lastOrdersFetchParams.search;
                } else if (WOTM_APP.lastOrdersFetchParams.term != null && WOTM_APP.lastOrdersFetchParams.term !== '') {
                    zmSearch = WOTM_APP.lastOrdersFetchParams.term;
                }
            }

            var doSaveRef = function () {
                $.post(all_order_list_params.ajax_url, {
                    action: 'otm_zone_match_save_ref',
                    security: WOTM_APP.ajaxNonce,
                    zone_order_id: zoneOid,
                    ref_order_id: refId,
                    match_kind: refId > 0 ? kind : '',
                    filters: zmFilters,
                    search: zmSearch
                }, function (response) {
                    if (response.success) {
                        WOTM_APP.updateNonce(response.data.new_nonce);
                        if (response.data.updates && typeof response.data.updates === 'object') {
                            Object.keys(response.data.updates).forEach(function (oid) {
                                var u = response.data.updates[oid];
                                if (!u || !u.html) {
                                    return;
                                }
                                var $td = $(
                                    '#orders-table-container tr.com-row[data-order-id="' + oid + '"] td.otm-column-match'
                                );
                                if ($td.length) {
                                    $td.html(u.html);
                                }
                            });
                        } else if (response.data.html) {
                            zoneCell.replaceWith(response.data.html);
                        }
                        WOTM_APP.showToast('Match updated successfully!');
                        row.addClass('otm-row-highlight');
                        setTimeout(function () {
                            row.removeClass('otm-row-highlight');
                        }, 1500);
                    } else {
                        var d = response.data;
                        if (d && d.new_nonce) {
                            WOTM_APP.updateNonce(d.new_nonce);
                        }
                        var errZm =
                            (d && (typeof d === 'string' ? d : (d.message || d))) || 'Error updating data.';
                        WOTM_APP.showToast('Error: ' + errZm);
                        removeCellDataInputEditor(input);
                    }
                }).always(finishZm);
            };

            if (refId > 0) {
                /* Check if the Ready order is already matched to another Zone Change order. */
                $.post(all_order_list_params.ajax_url, {
                    action: 'otm_zone_match_check_conflict',
                    security: WOTM_APP.ajaxNonce,
                    ref_order_id: refId,
                    zone_order_id: zoneOid
                }, function (checkResponse) {
                    if (checkResponse && checkResponse.success && checkResponse.data && checkResponse.data.new_nonce) {
                        WOTM_APP.updateNonce(checkResponse.data.new_nonce);
                    }
                    if (checkResponse && checkResponse.success && checkResponse.data && checkResponse.data.conflict) {
                        var existingId = checkResponse.data.existing_zone_id;
                        var msg =
                            '⚠️ Conflict Detected!\n\n' +
                            'Ready for Delivery order #' + refId + ' is already matched to\n' +
                            'Zone Change order #' + existingId + '.\n\n' +
                            'Do you want to reassign it here?\n\n' +
                            '✔ OK     → Reassign to this order.\n' +
                            '            ZC order #' + existingId + ' will be cleared\n' +
                            '            and auto re-matched from Ready for Delivery.\n\n' +
                            '✖ Cancel → Leave everything unchanged.';
                        if (!window.confirm(msg)) {
                            finishZm();
                            removeCellDataInputEditor(input);
                            return;
                        }
                    }
                    doSaveRef();
                }).fail(function () {
                    /* If conflict check fails (network error etc.), proceed with save directly. */
                    doSaveRef();
                });
            } else {
                doSaveRef();
            }
            return;
        }

        if (key === 'billing_phone' || key === 'shipping_phone' || key === 'phone') {
            var cc = cell.find('.phone-country-code').text();
            newValue = (cc || '') + newValue;
        }

        var initialCommit = cell.data('otm-commit-initial');
        if (String(newValue).trim() === String(initialCommit == null ? '' : initialCommit).trim()) {
            removeCellDataInputEditor(input);
            return;
        }

        if (input.data('otm-save-in-flight')) {
            return;
        }
        input.data('otm-save-in-flight', true);

        var finishAlways = function () {
            input.removeData('otm-save-in-flight');
        };

        if (abandonedCartId) {
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_update_abandoned_cart_field',
                security: WOTM_APP.ajaxNonce,
                abandoned_cart_id: abandonedCartId,
                meta_key: key,
                meta_value: newValue
            }, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    var dataSpan = cell.find('.cell-data');
                    var displayValue = newValue;
                    var sym = all_order_list_params.currency_symbol || '';
                    if (key === 'cart_total' || key === 'advance_paid_amount') {
                        var numAb = parseFloat(newValue);
                        displayValue = isNaN(numAb) ? newValue : (sym + numAb.toFixed(2));
                    }
                    dataSpan.text(displayValue);
                    removeCellDataInputEditor(input);
                    if (key === 'advance_paid_amount') {
                        var cartTotalCell = row.find('.otm-column-cart_total .cell-data');
                        var cartTotalText = (cartTotalCell.length ? cartTotalCell.text() : row.find('.otm-column-cart_total').text()).replace(sym, '').trim();
                        var cartTotal = parseFloat(cartTotalText) || 0;
                        var advance = parseFloat(String(newValue).replace(sym, '').trim()) || 0;
                        var payable = Math.max(0, cartTotal - advance);
                        var payableCell = row.find('.otm-column-payable_amount');
                        if (payableCell.find('.cell-data').length) {
                            payableCell.find('.cell-data').text(sym + payable.toFixed(2));
                        } else {
                            payableCell.text(sym + payable.toFixed(2));
                        }
                    }
                    WOTM_APP.showToast('Update successful!');
                    row.addClass('otm-row-highlight');
                    setTimeout(function () { row.removeClass('otm-row-highlight'); }, 1500);
                } else {
                    var errMsgAb = (response.data && (typeof response.data === 'string' ? response.data : response.data.message)) || 'Error updating data.';
                    WOTM_APP.showToast('Error: ' + errMsgAb);
                    removeCellDataInputEditor(input);
                }
            }).always(finishAlways);
            return;
        }

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_update_order_meta',
            security: WOTM_APP.ajaxNonce,
            order_id: orderId,
            meta_key: key,
            meta_value: newValue
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                removeCellDataInputEditor(input);
                WOTM_APP.showToast('Update successful!');
                row.addClass('otm-row-highlight');
                setTimeout(function () { row.removeClass('otm-row-highlight'); }, 1500);

                if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(row, response.data.live_row);
                } else {
                    var dataSpan = cell.find('.cell-data');
                    var displayValue = newValue;
                    if (key === 'order_total') {
                        displayValue = all_order_list_params.currency_symbol + newValue;
                    }
                    dataSpan.text(displayValue);
                    if (response.data.last_modified_history) {
                        WOTM_APP.updateLastModifiedCell(row, response.data.last_modified_history);
                    }
                    if (key === 'billing_phone' && response.data.hasOwnProperty('is_duplicate_phone')) {
                        if (response.data.is_duplicate_phone === true || response.data.is_duplicate_phone === 1) {
                            row.addClass('duplicate-phone');
                        } else {
                            row.removeClass('duplicate-phone');
                        }
                    }
                    if (key === 'advance_paid_amount' || key === 'order_total') {
                        var sym = all_order_list_params.currency_symbol || '';
                        var totalSpan = row.find('.otm-column-order_total .cell-data');
                        var totalText = totalSpan.length ? totalSpan.text() : row.find('.otm-column-order_total').text();
                        var totalVal = parseFloat(totalText.replace(sym, '').trim()) || 0;
                        var advSpan = row.find('.otm-column-advance_paid_amount .cell-data');
                        var advText = advSpan.length ? advSpan.text() : row.find('.otm-column-advance_paid_amount').text();
                        var advVal = parseFloat(advText.replace(sym, '').trim()) || 0;
                        if (key === 'order_total') { totalVal = parseFloat(newValue) || 0; }
                        if (key === 'advance_paid_amount') { advVal = parseFloat(newValue) || 0; }
                        var payableCell = row.find('.otm-column-payable_amount');
                        payableCell.text(sym + Math.max(0, totalVal - advVal).toFixed(2));
                    }
                    var plInputKeys = ['production_cost', 'production_cost_on_return', 'delivery_charge', 'courier_cod', 'loss_on_partial_delivery', 'advance_paid_amount', 'order_total'];
                    if (plInputKeys.indexOf(key) !== -1) {
                        var plCell = row.find('.otm-column-profit_loss');
                        if (plCell.length) {
                            plCell.text('…');
                            $.post(all_order_list_params.ajax_url, {
                                action: 'otm_get_order_pl_value',
                                security: WOTM_APP.ajaxNonce,
                                order_id: orderId
                            }, function (plResponse) {
                                if (plResponse.success) {
                                    WOTM_APP.updateNonce(plResponse.data.new_nonce);
                                    plCell.text(plResponse.data.profit_loss);
                                }
                            });
                        }
                    }
                    if (key === 'consignment_id') {
                        var invoiceBtn = row.find('.otm-print-invoice-btn');
                        if (invoiceBtn.length) {
                            invoiceBtn.prop('disabled', !newValue.trim());
                        }
                    }
                }
                if (typeof WOTM_APP.refreshPlSummaryIfPlDataChanged === 'function') {
                    WOTM_APP.refreshPlSummaryIfPlDataChanged(key);
                }
            } else {
                var errMsg = (response.data && (typeof response.data === 'string' ? response.data : (response.data.message || response.data))) || 'Error updating data.';
                WOTM_APP.showToast('Error: ' + errMsg);
                removeCellDataInputEditor(input);
            }
        }).always(finishAlways);
    }

    // Inline editing
    $(document).on('click', '.edit-cell-icon', function () {
        var cell = $(this).closest('.editable-cell');
        var row = cell.closest('tr');
        var dataSpan = cell.find('.cell-data');
        var currentData = dataSpan.text();
        var key = cell.data('key');

        if (key === 'billing_phone' || key === 'shipping_phone') {
            let countryCode = '';
            let phoneNumber = currentData;

            if (currentData.startsWith('+')) {
                const numberWithoutPlus = currentData.substring(1);
                const countryCodes = all_order_list_params.country_codes || [];

                // Find the longest matching country code
                for (const code of countryCodes) {
                    if (numberWithoutPlus.startsWith(code)) {
                        countryCode = '+' + code;
                        phoneNumber = numberWithoutPlus.substring(code.length);
                        break; // Exit after finding the first (longest) match
                    }
                }
            }

            // If no country code was matched, phoneNumber remains currentData
            if (countryCode === '') {
                phoneNumber = currentData;
            }


            cell.data('otm-commit-initial', currentData);
            var inputHTML = '<span class="phone-country-code">' + countryCode + '</span><input type="text" class="cell-data-input" value="' + phoneNumber.trim() + '">';
            dataSpan.hide();
            $(this).hide();
            cell.append(inputHTML);
        } else if (key === 'billing_country' || key === 'shipping_country') {
            var countrySelect = otmBuildCountrySelectHtml(currentData);
            cell.data('otm-commit-initial', countrySelect.initialValue);
            dataSpan.hide();
            $(this).hide();
            cell.append(countrySelect.html);
        } else if (key === 'billing_state' || key === 'shipping_state') {
            var stateSelect = otmBuildStateSelectHtml(row, key, currentData);
            if (stateSelect) {
                cell.data('otm-commit-initial', stateSelect.initialValue);
                dataSpan.hide();
                $(this).hide();
                cell.append(stateSelect.html);
            } else {
                var stateValueToEdit = currentData;
                cell.data('otm-commit-initial', stateValueToEdit);
                var stateInputHTML = ' <input type="text" class="cell-data-input" value="' + stateValueToEdit + '"> ';
                dataSpan.hide();
                $(this).hide();
                cell.append(stateInputHTML);
            }
        } else {
            var valueToEdit = currentData;
            if (key === 'zone_match_ref') {
                if (valueToEdit === '—' || valueToEdit === '\u2014' || valueToEdit === '-') {
                    valueToEdit = '';
                }
            }
            if (key === 'order_total' || key === 'cart_total' || key === 'advance_paid_amount') {
                valueToEdit = currentData.replace(all_order_list_params.currency_symbol || '', '').trim();
            }
            cell.data('otm-commit-initial', valueToEdit);
            var inputHTML;
            if (key === 'zone_match_ref') {
                var escZm = String(valueToEdit).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                inputHTML = ' <input type="text" class="cell-data-input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="' + escZm + '"> ';
            } else {
                inputHTML = ' <input type="text" class="cell-data-input" value="' + valueToEdit + '"> ';
            }
            dataSpan.hide();
            $(this).hide();
            cell.append(inputHTML);
        }

        var inputField = cell.find('.cell-data-input');
        inputField.focus();
        var tmpStr = inputField.val();
        inputField.val('');
        inputField.val(tmpStr);
        if (inputField[0]) {
            inputField[0].scrollLeft = inputField[0].scrollWidth;
        }
    });

    // Save on Tab / click outside (blur). Deferred so clicks on other controls still register.
    $(document).on('focusout', '.cell-data-input', function () {
        var input = $(this);
        setTimeout(function () {
            if (!input.length || !input[0].isConnected) {
                return;
            }
            if (input.data('otm-save-in-flight')) {
                return;
            }
            commitCellDataInput(input);
        }, 0);
    });

    $(document).on('keydown', '.cell-data-input', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitCellDataInput($(this));
        } else if (e.key === 'Escape') {
            e.preventDefault();
            removeCellDataInputEditor($(this));
        }
    });

    $(document).on('change', '.cell-data-select', function () {
        commitCellDataInput($(this));
    });

    // Custom tooltip for duplicate orders
    $(document).on('mouseover', '.duplicate-phone', function (e) {
        var tooltip = $('#otm-tooltip');
        tooltip.text('Repeat Order. Check properly before confirm.');
        tooltip.css({
            top: e.pageY + 10,
            left: e.pageX + 10
        }).show();
    });

    $(document).on('mouseout', '.duplicate-phone', function () {
        $('#otm-tooltip').hide();
    });

    $(document).on('mousemove', '.duplicate-phone', function (e) {
        $('#otm-tooltip').css({
            top: e.pageY + 10,
            left: e.pageX + 10
        });
    });

    // Order table column header tooltip (same pattern as inventory)
    var otmOrderTooltipShowTimer = null;
    var otmOrderTooltipHideTimer = null;
    function showOrderTooltipPopover($trigger, text) {
        var $pop = $('#otm-order-tooltip-popover');
        if (!$pop.length || !text) return;
        $pop.text(text).attr('aria-hidden', 'false').addClass('is-visible');
        var rect = $trigger[0].getBoundingClientRect();
        var popW = 280;
        var left = rect.left + (rect.width / 2) - (popW / 2);
        var top = rect.bottom + 6;
        var pad = 10;
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        if (left < pad) left = pad;
        if (left + popW > vw - pad) left = vw - popW - pad;
        $pop.css({ left: left + 'px', top: top + 'px' });
        var popH = $pop.outerHeight();
        if (top + popH > vh - pad) top = rect.top - popH - 6;
        if (top < pad) top = pad;
        $pop.css('top', top + 'px');
    }
    function hideOrderTooltipPopover() {
        var $pop = $('#otm-order-tooltip-popover');
        $pop.removeClass('is-visible is-pinned').attr('aria-hidden', 'true').text('');
    }
    $(document).on('mouseenter', '.otm-th-info', function () {
        var $el = $(this);
        clearTimeout(otmOrderTooltipHideTimer);
        otmOrderTooltipShowTimer = setTimeout(function () {
            var text = $el.attr('data-tooltip');
            if (text) showOrderTooltipPopover($el, text);
        }, 400);
    });
    $(document).on('mouseleave', '.otm-th-info', function () {
        clearTimeout(otmOrderTooltipShowTimer);
        otmOrderTooltipHideTimer = setTimeout(hideOrderTooltipPopover, 150);
    });
    $(document).on('click', '.otm-th-info', function (e) {
        e.preventDefault();
        clearTimeout(otmOrderTooltipShowTimer);
        clearTimeout(otmOrderTooltipHideTimer);
        var $el = $(this);
        var text = $el.attr('data-tooltip');
        var $pop = $('#otm-order-tooltip-popover');
        if (text && $pop.length) {
            if ($pop.hasClass('is-visible') && $pop.text() === text) {
                hideOrderTooltipPopover();
                return;
            }
            showOrderTooltipPopover($el, text);
            $pop.addClass('is-pinned');
            $(document).one('click', function (ev) {
                if (!$(ev.target).closest('.otm-th-info, #otm-order-tooltip-popover').length) {
                    hideOrderTooltipPopover();
                }
            });
        }
    });
    $(document).on('keydown', '.otm-th-info', function (e) {
        if (e.key === 'Escape') hideOrderTooltipPopover();
    });

    $(document).on('click', '.sort-icon', function () {
        var newSortBy = $(this).data('sort-key');
        var isDesc = $(this).hasClass('active-sort-desc');
        var isAsc = $(this).hasClass('active-sort-asc');

        if (isDesc) {
            WOTM_APP.sortOrder = 'ASC';
            WOTM_APP.sortBy = newSortBy;
        } else if (isAsc) {
            WOTM_APP.sortOrder = 'DESC';
            WOTM_APP.sortBy = newSortBy;
        } else {
            WOTM_APP.sortBy = newSortBy;
            WOTM_APP.sortOrder = 'DESC';
        }
        WOTM_APP.currentPage = 1;
        if (WOTM_APP.searchMode) {
            WOTM_APP.performSearch();
        } else {
            WOTM_APP.loadOrders();
        }
    });

    WOTM_APP.updateLastModifiedCell = function (row, history) {
        var cell = row.find('.otm-column-last_modified');
        if (!cell.length || !history || history.length === 0) {
            return;
        }

        var latestMod = history[0];
        var modDate = new Date(latestMod.time);
        var formattedModDate = ('0' + modDate.getDate()).slice(-2) + '-' + ('0' + (modDate.getMonth() + 1)).slice(-2) + '-' + modDate.getFullYear() + ' ' + ('0' + modDate.getHours()).slice(-2) + ':' + ('0' + modDate.getMinutes()).slice(-2);
        var latestModText = formattedModDate + ' by ' + latestMod.user_name + ': ' + latestMod.change;

        var historyHtml = '';
        history.forEach(function (modEntry) {
            var entryDate = new Date(modEntry.time);
            var formattedEntryDate = ('0' + entryDate.getDate()).slice(-2) + '-' + ('0' + (entryDate.getMonth() + 1)).slice(-2) + '-' + entryDate.getFullYear() + ' ' + ('0' + entryDate.getHours()).slice(-2) + ':' + ('0' + entryDate.getMinutes()).slice(-2);
            historyHtml += '<p><strong>' + modEntry.user_name + '</strong> (' + formattedEntryDate + '):<br>' + modEntry.change + '</p>';
        });

        var newCellHtml = '<div class="tracking-accordion">' +
            '<button class="accordion">' + latestModText + '</button>' +
            '<div class="panel" style="display:none;">' + historyHtml + '</div>' +
            '</div>';

        cell.html(newCellHtml);
        cell.find('.accordion').on('click', function () {
            $(this).toggleClass('active');
            $(this).next('.panel').toggle();
        });
    }

    // Assignee handlers
    $(document).on('change', '.otm-assign-staff-dropdown', function () {
        var dropdown = $(this);
        var abandonedCartId = dropdown.data('abandoned-cart-id');
        var staffId = dropdown.val();

        if (abandonedCartId) {
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_assign_abandoned_cart_to_staff',
                security: WOTM_APP.ajaxNonce,
                abandoned_cart_id: abandonedCartId,
                staff_id: staffId
            }, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    WOTM_APP.showToast('Cart assigned successfully.');
                } else {
                    WOTM_APP.showToast('Error assigning cart.');
                }
            });
            return;
        }

        var orderId = dropdown.data('order-id');
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_assign_order_to_staff',
            security: WOTM_APP.ajaxNonce,
            order_id: orderId,
            staff_id: staffId
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast('Order assigned successfully.');
                var assignRow = dropdown.closest('tr');
                if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(assignRow, response.data.live_row);
                } else {
                    var assigneeName = dropdown.find('option:selected').text();
                    dropdown.siblings('.assignee-display').text(assigneeName);
                    if (response.data.last_modified_history && response.data.last_modified_history.length > 0) {
                        WOTM_APP.updateLastModifiedCell(assignRow, response.data.last_modified_history);
                    }
                }
            } else {
                WOTM_APP.showToast('Error assigning order.');
            }
        });
    });

    // Abandoned cart: status dropdown
    // Abandoned cart: Send SMS
    $(document).on('click', '.otm-send-abandoned-cart-sms-btn', function () {
        var btn = $(this);
        var cartId = btn.data('abandoned-cart-id');
        btn.prop('disabled', true).text('Sending...');
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_send_abandoned_cart_sms',
            security: WOTM_APP.ajaxNonce,
            abandoned_cart_id: cartId
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast(response.data.message || 'SMS sent.');
                WOTM_APP.loadCurrentTabData();
            } else {
                var errMsg = (response.data && response.data.message) ? response.data.message : (typeof response.data === 'string' ? response.data : 'Failed to send SMS');
                WOTM_APP.showToast('Error: ' + errMsg);
            }
        }).fail(function () {
            WOTM_APP.showToast('Request failed.');
        }).always(function () {
            btn.prop('disabled', false).text('Send SMS');
        });
    });

    // Abandoned cart: Convert to order
    $(document).on('click', '.otm-convert-abandoned-cart-btn', function () {
        var btn = $(this);
        var cartId = btn.data('abandoned-cart-id');
        btn.prop('disabled', true).text('Converting… (courier rate)');
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_convert_abandoned_cart_to_order',
            security: WOTM_APP.ajaxNonce,
            abandoned_cart_id: cartId
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast('Order #' + response.data.order_id + ' created.');
                WOTM_APP.loadCurrentTabData();
            } else {
                WOTM_APP.showToast('Error: ' + (response.data || ''));
            }
        }).fail(function () {
            WOTM_APP.showToast('Request failed.');
        }).always(function () {
            btn.prop('disabled', false).text('Convert');
        });
    });

    // Abandoned cart: Delete (removes record; if customer abandons again, a new entry is captured)
    $(document).on('click', '.otm-delete-abandoned-cart-btn', function () {
        var btn = $(this);
        var cartId = btn.data('abandoned-cart-id');
        if (!confirm('Delete this cart? It will be removed permanently. If the same customer abandons checkout again, a new entry will appear.')) return;
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_delete_abandoned_cart',
            security: WOTM_APP.ajaxNonce,
            abandoned_cart_id: cartId
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast('Cart deleted.');
                WOTM_APP.loadCurrentTabData();
            } else {
                WOTM_APP.showToast('Error deleting cart.');
            }
        });
    });

    $(document).on('click', '#bulk-assign-button', function () {
        var button = $(this);
        var staffId = $('#bulk-assign-dropdown').val();
        var orderIds = [];
        $('.order-checkbox:checked').each(function () {
            orderIds.push($(this).val());
        });

        if (!staffId) {
            WOTM_APP.showToast('Please select a staff member to assign.');
            return;
        }

        if (orderIds.length === 0) {
            WOTM_APP.showToast('Please select at least one order to assign.');
            return;
        }

        button.prop('disabled', true);

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_bulk_assign_orders_to_staff',
            security: WOTM_APP.ajaxNonce,
            order_ids: orderIds,
            staff_id: staffId
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast(orderIds.length + ' orders assigned successfully.');
                WOTM_APP.loadOrders(); // Reload the table to show changes
            } else {
                WOTM_APP.showToast('Error: ' + response.data);
            }
            button.prop('disabled', false);
        }).fail(function () {
            WOTM_APP.showToast('An AJAX error occurred.');
            button.prop('disabled', false);
        });
    });

    // Select All Checkbox for Assignee
    $(document).on('click', '#select-all-assignee', function () {
        var isChecked = $(this).prop('checked');
        $('.assignee-checkbox').prop('checked', isChecked);
        $('.com-table tbody tr').toggleClass('selected', isChecked);
    });

    // Also toggle class when assignee checkbox is clicked directly
    $(document).on('click', '.assignee-checkbox', function (e) {
        $(this).closest('tr').toggleClass('selected', $(this).prop('checked'));
    });

    // Bulk Assign Button in Header
    $(document).on('click', '#bulk-assign-button-header', function () {
        var button = $(this);
        var staffId = $('#bulk-assign-dropdown-header').val();
        var ids = [];
        $('.assignee-checkbox:checked').each(function () {
            ids.push($(this).val());
        });

        if (!staffId) {
            WOTM_APP.showToast('Please select a staff member to assign.');
            return;
        }

        if (ids.length === 0) {
            WOTM_APP.showToast((WOTM_APP.currentTab === 'incomplete_order' || WOTM_APP.currentTab === 'abandoned_carts') ? 'Please select at least one cart to assign.' : 'Please select at least one order to assign.');
            return;
        }

        button.prop('disabled', true);

        if (WOTM_APP.currentTab === 'incomplete_order' || WOTM_APP.currentTab === 'abandoned_carts') {
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_bulk_assign_abandoned_carts_to_staff',
                security: WOTM_APP.ajaxNonce,
                abandoned_cart_ids: ids,
                staff_id: staffId
            }, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    WOTM_APP.showToast(response.data.message || ids.length + ' carts assigned successfully.');
                    WOTM_APP.loadAbandonedCarts();
                } else {
                    WOTM_APP.showToast('Error: ' + (response.data || ''));
                }
                button.prop('disabled', false);
            }).fail(function () {
                WOTM_APP.showToast('An AJAX error occurred.');
                button.prop('disabled', false);
            });
            return;
        }

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_bulk_assign_orders_to_staff',
            security: WOTM_APP.ajaxNonce,
            order_ids: ids,
            staff_id: staffId
        }, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast(ids.length + ' orders assigned successfully.');
                WOTM_APP.loadOrders();
            } else {
                WOTM_APP.showToast('Error: ' + response.data);
            }
            button.prop('disabled', false);
        }).fail(function () {
            WOTM_APP.showToast('An AJAX error occurred.');
            button.prop('disabled', false);
        });
    });

    // OTP Verification on Checkout
    if ($('body').hasClass('woocommerce-checkout')) {
        var otpWrapper = $('#otm-otp-verification-wrapper');
        var phoneField = $('#billing_phone');
        var sendButton = $('#otm-send-otp-button');
        var countdownSpan = $('#otm-otp-countdown');
        var messageSpan = $('#otm-otp-message');
        var otpFieldWrapper = $('#otm-otp-field-wrapper');
        var countdown;

        function toggleOtpFields() {
            var phone = phoneField.val().trim();
            if (phone.length > 5) { // Basic validation
                otpWrapper.slideDown();
                if (!countdownSpan.is(':visible')) {
                    sendButton.prop('disabled', false);
                }
            } else {
                otpWrapper.slideUp();
                sendButton.prop('disabled', true);
            }
        }

        phoneField.on('input', toggleOtpFields);
        toggleOtpFields(); // Initial check

        sendButton.on('click', function () {
            var phone = phoneField.val().trim();
            if (!phone) {
                messageSpan.text('Please enter a phone number.').css('color', 'red');
                return;
            }

            sendButton.prop('disabled', true).text('Sending...');
            messageSpan.text('').css('color', '');

            $.post(all_order_list_params.ajax_url, {
                action: 'otm_send_checkout_otp',
                phone: phone,
                security: '<?php echo wp_create_nonce("otm-otp-nonce"); ?>'
            }, function (response) {
                if (response.success) {
                    messageSpan.text(response.data.message).css('color', 'green');
                    otpFieldWrapper.slideDown();
                    startCountdown(60);
                } else {
                    messageSpan.text(response.data.message).css('color', 'red');
                    sendButton.prop('disabled', false).text('Verify number');
                }
            });
        });

        function startCountdown(seconds) {
            var timer = seconds;
            countdownSpan.show();
            sendButton.text('Resend OTP');

            countdown = setInterval(function () {
                countdownSpan.text('Resend in ' + timer + 's');
                timer--;
                if (timer < 0) {
                    clearInterval(countdown);
                    countdownSpan.hide();
                    sendButton.prop('disabled', false);
                }
            }, 1000);
        }
    }

    // Zone Selector Logic (Drill-Down Version)
    var currentZoneInput;
    var zoneDropdownState = {
        view: 'cities', // 'cities' or 'zones'
        cityKey: null
    };

    WOTM_APP.buildZoneDropdown = function (input) {
        currentZoneInput = input;
        var dropdown = input.siblings('.zone-dropdown');
        var searchTerm = input.val().toLowerCase();
        var html = '<ul>';

        if (zoneDropdownState.view === 'zones' && zoneDropdownState.cityKey) {
            // --- ZONES VIEW ---
            html += '<li class="zone-back-btn">&lt; Back to Cities</li>';
            var cityParts = zoneDropdownState.cityKey.split(',');
            var cityName = cityParts.length > 1 ? cityParts[1] : zoneDropdownState.cityKey;
            html += '<li class="city-group">' + cityName + '</li>';

            var zones = WOTM_APP.courierZones[zoneDropdownState.cityKey] || [];
            zones.forEach(function (zoneKey) {
                var zoneParts = zoneKey.split(',');
                var zoneName = zoneParts.length > 1 ? zoneParts[1] : zoneKey;
                var value = zoneDropdownState.cityKey + '|' + zoneKey;
                html += '<li class="zone-item" data-value="' + value + '">' + zoneName + '</li>';
            });

        } else {
            // --- CITIES VIEW (DEFAULT) ---
            var cities = Object.keys(WOTM_APP.courierZones);
            if (cities.length === 0) {
                html += '<li class="otm-zone-empty-msg">No courier selected. To show zones, go to <strong>Easy Order Manager &rarr; Courier</strong> and select a courier name under Courier Selection.</li>';
                html += '</ul>';
                dropdown.html(html).show();
                return;
            }
            var filteredCities = cities.filter(function (cityKey) {
                var cityParts = cityKey.split(',');
                var cityName = cityParts.length > 1 ? cityParts[1] : cityKey;
                return cityName.toLowerCase().includes(searchTerm);
            });

            // If user searches by thana/zone name, show matching "City > Zone" as direct options
            if (searchTerm.length >= 1) {
                cities.forEach(function (cityKey) {
                    var cityParts = cityKey.split(',');
                    var cityName = (cityParts.length > 1 ? cityParts[1] : cityKey).toString().trim();
                    var zones = WOTM_APP.courierZones[cityKey] || [];
                    zones.forEach(function (zoneKey) {
                        var zoneParts = zoneKey.split(',');
                        var zoneName = (zoneParts.length > 1 ? zoneParts[1] : zoneKey).toString().trim();
                        if (zoneName.toLowerCase().includes(searchTerm)) {
                            var value = cityKey + '|' + zoneKey;
                            var displayText = cityName + ' > ' + zoneName;
                            var safeDisplay = displayText.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            html += '<li class="zone-item" data-value="' + value.replace(/"/g, '&quot;') + '" data-display="' + safeDisplay + '">' + displayText + '</li>';
                        }
                    });
                });
            }

            filteredCities.forEach(function (cityKey) {
                var cityParts = cityKey.split(',');
                var cityName = cityParts.length > 1 ? cityParts[1] : cityKey;
                html += '<li class="city-item" data-city-key="' + cityKey + '">' + cityName + ' &gt;</li>';
            });
        }

        html += '</ul>';
        dropdown.html(html).show();
    }

    $(document).on('focus', '.zone-search-input', function () {
        zoneDropdownState.view = 'cities';
        zoneDropdownState.cityKey = null;
        WOTM_APP.buildZoneDropdown($(this));
    });

    $(document).on('input', '.zone-search-input', function () {
        zoneDropdownState.view = 'cities';
        zoneDropdownState.cityKey = null;
        WOTM_APP.buildZoneDropdown($(this));
    });

    // Handle city selection to drill down
    $(document).on('click', '.zone-dropdown .city-item', function (e) {
        e.stopPropagation();
        zoneDropdownState.view = 'zones';
        zoneDropdownState.cityKey = $(this).data('city-key');
        currentZoneInput.val(''); // Clear search for zone view
        WOTM_APP.buildZoneDropdown(currentZoneInput);
    });

    // Handle Back button
    $(document).on('click', '.zone-dropdown .zone-back-btn', function (e) {
        e.stopPropagation();
        zoneDropdownState.view = 'cities';
        zoneDropdownState.cityKey = null;
        currentZoneInput.val('');
        WOTM_APP.buildZoneDropdown(currentZoneInput);
    });

    // Handle zone selection (orders and abandoned carts, and Bulk SMS filter)
    $(document).on('click', '.zone-dropdown .zone-item', function (e) {
        e.stopPropagation();
        var value = $(this).data('value');
        var displayText = $(this).data('display');
        if (!displayText) {
            var zoneName = $(this).text();
            var cityKey = value.split('|')[0];
            var cityParts = cityKey.split(',');
            var cityName = cityParts.length > 1 ? cityParts[1] : cityKey;
            displayText = cityName + ' > ' + zoneName;
        }

        currentZoneInput.val(displayText);
        $('.zone-dropdown').hide();

        if (currentZoneInput.attr('id') === 'bulk-sms-zone-input') {
            $('#bulk-sms-zone-value').val(value);
            return;
        }
        if (currentZoneInput.attr('id') === 'filter-zone-input') {
            $('#filter-zone-value').val(value);
            return;
        }

        var row = currentZoneInput.closest('tr');
        var orderId = row.data('order-id');
        var abandonedCartId = row.data('abandoned-cart-id');

        if (abandonedCartId) {
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_update_abandoned_cart_field',
                security: WOTM_APP.ajaxNonce,
                abandoned_cart_id: abandonedCartId,
                meta_key: 'zone',
                meta_value: value
            }, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    WOTM_APP.showToast('Zone updated.');
                } else {
                    WOTM_APP.showToast('Error updating zone.');
                }
            });
        } else if (orderId) {
            var zoneRow = currentZoneInput.closest('tr');
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_update_order_meta',
                security: WOTM_APP.ajaxNonce,
                order_id: orderId,
                meta_key: '_otm_zone',
                meta_value: value
            }, function (response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    WOTM_APP.showToast('Zone updated.');
                    if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                        WOTM_APP.applyLiveOrderRowPatch(zoneRow, response.data.live_row);
                    }
                } else {
                    WOTM_APP.showToast('Error updating zone.');
                }
            });
        }
    });

    // Hide dropdown when clicking outside
    $(document).on('click', function (e) {
        if (!$(e.target).closest('.zone-selector-container').length) {
            $('.zone-dropdown').hide();
        }
    });

    // Run Fraud Check button click handler (orders and abandoned carts)
    $(document).on('click', '.otm-run-fraud-check-btn', function () {
        var button = $(this);
        var orderId = button.data('order-id');
        var abandonedCartId = button.data('abandoned-cart-id');
        var cell = button.closest('td');

        button.prop('disabled', true).text('Checking...');

        var postData = {
            security: WOTM_APP.ajaxNonce
        };
        var action = 'otm_run_fraud_check';
        if (abandonedCartId) {
            action = 'otm_run_fraud_check_abandoned_cart';
            postData.abandoned_cart_id = abandonedCartId;
        } else {
            postData.order_id = orderId;
        }
        postData.action = action;

        $.post(all_order_list_params.ajax_url, postData, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast('Fraud check complete.');
                var fraudRow = cell.closest('tr');
                if (response.data.live_row && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                    WOTM_APP.applyLiveOrderRowPatch(fraudRow, response.data.live_row);
                } else {
                    cell.html(response.data.new_html);
                }
            } else {
                WOTM_APP.showToast('Error: ' + (response.data && response.data.message ? response.data.message : 'Check failed'));
                button.prop('disabled', false).text('Check');
            }
        }).fail(function () {
            WOTM_APP.showToast('AJAX request failed.');
            button.prop('disabled', false).text('Check');
        });
    });

    // Courier Rate Detail button click handler (orders and abandoned carts)
    $(document).on('click', '.otm-courier-rate-detail-btn', function () {
        var button = $(this);
        var orderId = button.data('order-id');
        var abandonedCartId = button.data('abandoned-cart-id');
        var modal = $('#otm-fraud-modal');
        var modalBody = $('#otm-fraud-modal-body');
        var closeModal = modal.find('.otm-modal-close');

        button.prop('disabled', true).text('Loading...');
        modalBody.html('<div class="loading-indicator">Loading details...</div>');
        modal.show();

        var postData = { security: WOTM_APP.ajaxNonce };
        var action = 'otm_get_fraud_dashboard_content';
        if (abandonedCartId) {
            action = 'otm_get_abandoned_cart_fraud_detail';
            postData.abandoned_cart_id = abandonedCartId;
        } else {
            postData.order_id = orderId;
        }
        postData.action = action;

        $.post(all_order_list_params.ajax_url, postData, function (response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                modalBody.html(response.data.html);
                if (!abandonedCartId) {
                    modalBody.find('button[name="wotm_fcc_recheck"]').closest('p').hide();
                    modalBody.find('input[name="_wotm_fcc_recheck_nonce"]').hide();
                }
            } else {
                modalBody.html('<p class="error-message">Error: ' + (response.data || 'Unknown error') + '</p>');
            }
        }).fail(function () {
            modalBody.html('<p class="error-message">AJAX request failed.</p>');
        }).always(function () {
            button.prop('disabled', false).text('Detail');
        });

        closeModal.one('click', function() {
            modal.hide();
        });

        $(window).one('click', function(event) {
            if ($(event.target).is(modal)) {
                modal.hide();
            }
        });
    });

    // Abandoned cart: Select All Checkbox
    $(document).on('change', '#select-all-abandoned-carts', function () {
        $('.otm-abandoned-cart-checkbox').prop('checked', $(this).prop('checked'));
    });

    // Abandoned cart: Apply Bulk Action using existing single endpoints
    $(document).on('click', '#bulk-abandoned-cart-actions-button', function () {
        var actionType = $('#bulk-abandoned-cart-actions-dropdown').val();
        if (!actionType) {
            WOTM_APP.showToast('Please select an action.');
            return;
        }

        var selectedIds = [];
        $('.otm-abandoned-cart-checkbox:checked').each(function () {
            selectedIds.push($(this).val());
        });

        if (selectedIds.length === 0) {
            WOTM_APP.showToast('Please select at least one cart.');
            return;
        }
        
        if (actionType === 'delete' && !confirm('Delete ' + selectedIds.length + ' cart(s)? They will be removed permanently.')) return;
        if (actionType === 'convert' && !confirm('Convert ' + selectedIds.length + ' cart(s) into orders?')) return;

        var btn = $(this);
        var originalBtnHtml = btn.html();
        btn.prop('disabled', true).text('...');
        
        // Reuse existing endpoints
        var ajaxAction = actionType === 'convert' ? 'otm_convert_abandoned_cart_to_order' : 'otm_delete_abandoned_cart';
        var currentIndex = 0;
        var successCount = 0;

        function processNext() {
            if (currentIndex >= selectedIds.length) {
                // All items processed
                btn.prop('disabled', false).html(originalBtnHtml);
                WOTM_APP.showToast('Bulk ' + actionType + ' complete. Processed: ' + successCount);
                if (typeof WOTM_APP.loadCurrentTabData === 'function') {
                    WOTM_APP.loadCurrentTabData();
                } else {
                    location.reload();
                }
                return;
            }

            var cartId = selectedIds[currentIndex];
            
            $.post(all_order_list_params.ajax_url, {
                action: ajaxAction,
                security: WOTM_APP.ajaxNonce,
                abandoned_cart_id: cartId
            }, function (response) {
                if (response.success) {
                    successCount++;
                    if (response.data && response.data.new_nonce) {
                        WOTM_APP.updateNonce(response.data.new_nonce);
                    }
                }
            }).fail(function () {
                console.error('Bulk ' + actionType + ' failed for cart ID: ' + cartId);
            }).always(function () {
                currentIndex++;
                processNext(); // Process next item strictly sequentially (zero server spike)
            });
        }

        WOTM_APP.showToast('Processing ' + selectedIds.length + ' carts sequentially...');
        processNext();
    });

})(jQuery, WOTM_APP);