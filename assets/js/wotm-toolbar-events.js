(function($) {
    
    // --- Frontend SMS Character & Parts Counter (same rules as admin) ---
    // GSM 7bit: 160 single / 153 per segment. Extended chars (~^{}[]|\) count as 2.
    // Unicode (UCS-2): 70 single / 67 per segment.
    var otmGsmExtendedChars = new Set('~^{}[]\\|');
    function otmGsmBillingLength(str) {
        var len = 0;
        for (var i = 0; i < str.length; i++) {
            len += otmGsmExtendedChars.has(str[i]) ? 2 : 1;
        }
        return len;
    }
    function otmUpdateSmsCounter(textarea) {
        var text = (textarea.val() || '');
        var hasUnicode = /[^\u0000-\u007F]/.test(text);
        var gsm7Limit = 160, gsm7MultipartLimit = 153;
        var unicodeLimit = 70, unicodeMultipartLimit = 67;
        var billingLength, smsParts;

        if (hasUnicode) {
            // Use UTF-16 code units length; emojis count as 2
            billingLength = text.length;
            smsParts = billingLength <= 0 ? 1 : (billingLength <= unicodeLimit ? 1 : Math.ceil(billingLength / unicodeMultipartLimit));
        } else {
            billingLength = otmGsmBillingLength(text);
            smsParts = billingLength <= 0 ? 1 : (billingLength <= gsm7Limit ? 1 : Math.ceil(billingLength / gsm7MultipartLimit));
        }

        var counterDiv = textarea.nextAll('.otm-sms-counter').first();
        if (counterDiv.length) {
            counterDiv.text('Characters: ' + billingLength + ' / SMS: ' + smsParts);
        }
    }
    // Bangla required for bulk SMS (govt rule): at least one character in Bengali Unicode range
    function hasBanglaCharacter(text) {
        return /[\u0980-\u09FF]/.test(text || '');
    }
    function updateBulkSmsBanglaState() {
        var message = $('#bulk-sms-message').val().trim();
        var hasBangla = hasBanglaCharacter(message);
        var isEmpty = message.length === 0;
        var $err = $('#bulk-sms-bangla-error');
        var $btn = $('#bulk-sms-send-btn');
        var resultEl = $('#bulk-sms-count-result');
        var countReceived = resultEl.attr('data-count-received') === '1';
        if (!isEmpty && !hasBangla) {
            $err.show();
            $btn.prop('disabled', true);
        } else {
            $err.hide();
            $btn.prop('disabled', isEmpty || !countReceived);
        }
    }
    function clearBulkSmsCountReceived() {
        var resultEl = $('#bulk-sms-count-result');
        resultEl.removeAttr('data-count-received').hide().text('');
        updateBulkSmsBanglaState();
    }
    $(document).on('input', '#sms-message, #bulk-sms-message', function() {
        otmUpdateSmsCounter($(this));
        if ($(this).attr('id') === 'bulk-sms-message') {
            updateBulkSmsBanglaState();
        }
    });
    $(document).on('click', '#otm-profit-loss-toggle-btn', function(e) {
        // If the click came from the switch itself, let the 'change' handler do the work.
        if ($(e.target).closest('.otm-toggle-switch').length) {
            return;
        }

        // Otherwise, the user clicked the button text. Manually toggle the checkbox.
        // This will trigger the 'change' event we define below.
        var checkbox = $('#otm-profit-loss-toggle-checkbox');
        checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
    });

    $(document).on('change', '#otm-profit-loss-toggle-checkbox', function(e) {
        e.stopPropagation(); // Prevent the click from bubbling up to the button handler.
        WOTM_APP.isProfitLossMode = $(this).is(':checked');
        
        // Save the state for the user
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_save_profit_loss_mode_state',
            security: WOTM_APP.ajaxNonce,
            is_enabled: WOTM_APP.isProfitLossMode
        }, function(response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
            }
        });

        WOTM_APP.updateUiForProfitLossMode();
        WOTM_APP.loadOrders();
    });

    // Tab click handler
    $('.tab-buttons').on('click', '.tab-btn', function(){
        WOTM_APP.currentTab = $(this).data('tab');
        WOTM_APP.currentPage = 1;
        $('.tab-btn').removeClass('active');
        $(this).addClass('active');
        WOTM_APP.searchMode = false;
        WOTM_APP.loadCurrentTabData();
    });

    // Search handler
    $('#com-search').on('input', function(){
        const term = $(this).val().trim();
        WOTM_APP.searchTerm = term;
        WOTM_APP.currentPage = 1;
        
        clearTimeout(WOTM_APP.searchTimer);
        
        if (term.length >= 2) {
            WOTM_APP.searchMode = true;
            WOTM_APP.searchTimer = setTimeout(WOTM_APP.performSearch, 800);
        } else if (term.length === 0) {
            WOTM_APP.searchMode = false;
            WOTM_APP.loadOrders();
        }
    });

    var otmMainFilterDefaultLabel = 'Filter';
    var otmMainFilterActiveLabel = 'Clear Filter';

    function otmOrderFiltersHaveAnyValue() {
        if (($('#date-range-from').val() || '').toString().trim()) return true;
        if (($('#date-range-to').val() || '').toString().trim()) return true;
        var orderFrom = $('#order-range-from').val();
        var orderTo = $('#order-range-to').val();
        if (orderFrom !== '' && orderFrom != null) return true;
        if (orderTo !== '' && orderTo != null) return true;
        if (($('#product-filter-id').val() || '').toString().trim()) return true;
        if (($('#product-filter').val() || '').toString().trim()) return true;
        if (($('#category-filter').val() || '').toString().trim()) return true;
        var $assignee = $('#assignee-filter');
        if ($assignee.length && ($assignee.val() || '').toString().trim()) return true;
        if (($('#filter-zone-value').val() || '').toString().trim()) return true;
        return false;
    }

    function otmSyncMainFilterButton() {
        var $btn = $('#filter-button');
        if (!$btn.length) return;
        if (otmOrderFiltersHaveAnyValue()) {
            $btn.text(otmMainFilterActiveLabel).addClass('otm-main-filter-clear');
        } else {
            $btn.text(otmMainFilterDefaultLabel).removeClass('otm-main-filter-clear');
        }
    }

    function otmClearOrderListFilterFields() {
        $('#date-range-from').val('');
        $('#date-range-to').val('');
        $('#order-range-from').val('');
        $('#order-range-to').val('');
        $('#product-filter').val('');
        $('#product-filter-id').val('');
        $('#category-filter').val('');
        $('#assignee-filter').val('');
        $('#filter-zone-input').val('');
        $('#filter-zone-value').val('');
    }

    // Filter button handler
    $('#filter-button').on('click', function() {
        var $btn = $(this);
        if ($btn.hasClass('otm-main-filter-clear')) {
            $('#bulk-sms-dropdown').hide();
            $('#otm-inventory-low-stock-dropdown').hide();
            $('#filter-dropdown').hide();
            otmClearOrderListFilterFields();
            otmSyncMainFilterButton();
            WOTM_APP.currentPage = 1;
            WOTM_APP.loadOrders();
            return;
        }
        $('#bulk-sms-dropdown').hide();
        $('#otm-inventory-low-stock-dropdown').hide();
        $('#filter-dropdown').toggle();
        if ($('#filter-dropdown').is(':visible')) {
            requestAnimationFrame(function() {
                window.otmPositionDropdownInViewport('filter-button', 'filter-dropdown');
            });
        }
    });

    // Inventory low-stock bell: toggle dropdown and fetch list when opening
    $(document).on('click', '#otm-inventory-low-stock-bell', function(e) {
        e.preventDefault();
        var $dropdown = $('#otm-inventory-low-stock-dropdown');
        $('#filter-dropdown').hide();
        $('#bulk-sms-dropdown').hide();
        if ($dropdown.is(':visible')) {
            $dropdown.hide();
            return;
        }
        $dropdown.show();
        requestAnimationFrame(function() {
            window.otmPositionDropdownInViewport('otm-inventory-low-stock-bell', 'otm-inventory-low-stock-dropdown');
        });
        var $list = $('#otm-inventory-low-stock-list');
        if (typeof wotm_inventory_params === 'undefined') return;
        $list.text('Loading…');
        $.post(wotm_inventory_params.ajax_url, {
            action: 'wotm_inventory_low_stock_list',
            nonce: wotm_inventory_params.nonce
        }).done(function(res) {
            if (res.success && res.data && res.data.html) {
                $list.html(res.data.html);
            } else {
                $list.text('Unable to load list.');
            }
        }).fail(function() {
            $list.text('Unable to load list.');
        });
    });

    $(document).on('click', function(event) {
        if (!$(event.target).closest('#otm-inventory-low-stock-bell-wrap').length) {
            $('#otm-inventory-low-stock-dropdown').hide();
        }
    });

    // On mobile: set Send SMS / Bulk SMS dropdown left so it stays in viewport (dropdown uses position:absolute and scrolls with button)
    window.otmPositionDropdownInViewport = function(buttonId, dropdownId) {
        if (window.innerWidth > 768) return;
        var btn = document.getElementById(buttonId);
        var dropdown = document.getElementById(dropdownId);
        if (!btn || !dropdown) return;
        var parent = dropdown.offsetParent;
        if (!parent) return;
        var parentRect = parent.getBoundingClientRect();
        var dropdownWidth = Math.min(500, window.innerWidth - 24);
        var viewportPadding = 12;
        var leftMin = viewportPadding - parentRect.left;
        var leftMax = window.innerWidth - viewportPadding - dropdownWidth - parentRect.left;
        var left = Math.max(leftMin, Math.min(0, leftMax));
        dropdown.style.left = left + 'px';
        dropdown.style.right = 'auto'; // Ensure right doesn't conflict
    };

    // Send SMS button handler
    $('#send-sms-button').on('click', function() {
        $('#send-sms-dropdown').toggle();
        if ($('#send-sms-dropdown').is(':visible')) {
            requestAnimationFrame(function() {
                window.otmPositionDropdownInViewport('send-sms-button', 'send-sms-dropdown');
            });
            otmUpdateSmsCounter($('#sms-message'));
        }
    });

    // Hide dropdowns when clicking outside
    $(document).on('click', function(event) {
        if (!$(event.target).closest('.filter-container').length && !$(event.target).closest('#otm-inventory-low-stock-bell-wrap').length) {
            $('#filter-dropdown').hide();
        }
        if (!$(event.target).closest('.sms-container').length) {
            $('#send-sms-dropdown').hide();
        }
        if (!$(event.target).closest('.add-new-order-container').length) {
            $('#add-new-order-modal').hide();
        }
        if (!$(event.target).closest('#bulk-sms-container').length) {
            $('#bulk-sms-dropdown').hide();
        }
    });

    // Bulk SMS: clear zone value when user clears the zone input
    $(document).on('input', '#bulk-sms-zone-input', function() {
        if ($(this).val().trim() === '') {
            $('#bulk-sms-zone-value').val('');
        }
    });

    // Filter: clear zone value when user clears the zone input
    $(document).on('input', '#filter-zone-input', function() {
        if ($(this).val().trim() === '') {
            $('#filter-zone-value').val('');
        }
    });

    // Bulk SMS: open/close dropdown (same pattern as Filter & Export)
    $(document).on('click', '#bulk-sms-button', function() {
        $('#filter-dropdown').hide();
        $('#bulk-sms-dropdown').toggle();
        if ($('#bulk-sms-dropdown').is(':visible')) {
            requestAnimationFrame(function() {
                window.otmPositionDropdownInViewport('bulk-sms-button', 'bulk-sms-dropdown');
            });
            clearBulkSmsCountReceived();
            updateBulkSmsBanglaState();
            otmUpdateSmsCounter($('#bulk-sms-message'));
        }
        if ($('#bulk-sms-dropdown').is(':visible') && $('#bulk-sms-category option').length <= 1) {
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_get_product_categories',
                security: WOTM_APP.ajaxNonce,
            }, function(response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    var options = '<option value="">All Categories</option>';
                    response.data.categories.forEach(function(category) {
                        options += '<option value="' + category.id + '">' + category.text + '</option>';
                    });
                    $('#bulk-sms-category').html(options);
                }
            });
        }
    });

    $('#add-new-order-button').on('click', function() {
        $('#add-new-order-modal').toggle();
        if ($('#add-new-order-modal').is(':visible')) {
            requestAnimationFrame(function() {
                window.otmPositionDropdownInViewport('add-new-order-button', 'add-new-order-modal');
            });
        }
    });
    
    $(document).on('click', '#cancel-new-order-button', function() {
        $('#add-new-order-modal').hide();
    });

    var newOrderProductSearchTimeout;
    $(document).on('input', '#add-new-order-modal .product-search-input', function() {
        var input = $(this);
        var suggestionsDiv = input.siblings('.product-suggestions');
        var term = input.val().trim();

        clearTimeout(newOrderProductSearchTimeout);

        if (term.length < 2) {
            suggestionsDiv.hide().empty();
            return;
        }

        newOrderProductSearchTimeout = setTimeout(function() {
            $.post(all_order_list_params.ajax_url, {
                action: 'search_products',
                security: WOTM_APP.ajaxNonce,
                term: term
            }, function(response) {
                if (response.success) {
                    window.otm_last_product_search_response = response.data; // Store the response
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    var html = '<ul>';
                    response.data.products.forEach(function(product) {
                        html += '<li data-product-id="' + product.id + '" data-price="' + product.price + '">' + product.text + '</li>';
                    });
                    html += '</ul>';
                    suggestionsDiv.html(html).show();
                } else {
                    suggestionsDiv.hide().empty();
                }
            });
        }, 300);
    });

    $(document).on('click', '#add-new-order-modal .product-suggestions li', function(event) {
        event.stopPropagation();
        var selectedLi = $(this);
        var productId = selectedLi.data('product-id');
        var productName = selectedLi.text();
        
        // Find the product in the response data to get the correct price
        var productPrice = 0;
        if (window.otm_last_product_search_response && window.otm_last_product_search_response.products) {
            var product = window.otm_last_product_search_response.products.find(p => p.id == productId);
            if (product) {
                productPrice = product.price;
            }
        }

        var selectedProductsDiv = $('#add-new-order-modal .selected-products');

        console.log('Product selected from suggestion. ID:', productId, 'Price:', productPrice); // Re-added log

        if (selectedProductsDiv.find('.selected-product-item[data-product-id="' + productId + '"]').length > 0) {
            WOTM_APP.showToast('Product already added.');
            return;
        }

        var productHtml = '<div class="selected-product-item" data-product-id="' + productId + '" data-price="' + productPrice + '">' + 
            '<span>' + productName + '</span>' + 
            '<input type="number" class="product-quantity" value="1" min="1" style="width: 60px; margin: 0 5px;">' + 
            '<button class="remove-product-button">X</button>' + 
            '</div>';

        selectedProductsDiv.append(productHtml);
        WOTM_APP.calculateTotal();

        $('#add-new-order-modal .product-search-input').val('');
        $('#add-new-order-modal .product-suggestions').hide().empty();
    });

    $(document).on('click', '#add-new-order-modal .remove-product-button', function(event) {
        event.stopPropagation();
        $(this).closest('.selected-product-item').remove();
        WOTM_APP.calculateTotal();
    });

    $(document).on('change', '#add-new-order-modal .product-quantity, #new-order-shipping-charge', function() {
        WOTM_APP.calculateTotal();
    });

    WOTM_APP.calculateTotal = function() {
        console.log('calculateTotal function called.'); // Re-added log
        var total = 0;
        $('#add-new-order-modal .selected-product-item').each(function() {
            var price = parseFloat($(this).data('price'));
            var quantity = parseInt($(this).find('.product-quantity').val());
            console.log('Calculating item - Price:', price, 'Quantity:', quantity); // Re-added log
            if (!isNaN(price) && !isNaN(quantity)) {
                total += price * quantity;
            }
        });

        var shipping = parseFloat($('#new-order-shipping-charge').val());
        console.log('Shipping charge:', shipping); // Re-added log
        if (!isNaN(shipping)) {
            total += shipping;
        }

        $('#total-order-amount').val(total.toFixed(2));
        console.log('Total displayed:', total.toFixed(2)); // Re-added log
    }

    $('#new-order-form').on('submit', function(e) {
        e.preventDefault();
        var button = $('#create-order-button');
        button.prop('disabled', true).text('Creating… (courier rate)');

        var products = [];
        $('#add-new-order-modal .selected-products .selected-product-item').each(function() {
            products.push({
                id: $(this).data('product-id'),
                quantity: $(this).find('.product-quantity').val()
            });
        });

        var orderData = {
            billing_first_name: $('#new-order-billing-first-name').val(),
            billing_phone: $('#new-order-billing-phone').val(),
            billing_address_1: $('#new-order-billing-address-1').val(),
            order_comments: $('#new-order-order-comments').val(),
            invoice_note: $('#new-order-invoice-note').val(),
            shipping_charge: $('#new-order-shipping-charge').val(),
            order_total: $('#total-order-amount').val(),
            products: products
        };

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_create_new_order',
            security: WOTM_APP.ajaxNonce,
            order_data: orderData
        }, function(response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast('Order created successfully!');
                $('#add-new-order-modal').hide();
                $('#new-order-form')[0].reset();
                $('#total-order-amount').val('0.00');
                $('#add-new-order-modal .selected-products').empty();
                WOTM_APP.loadOrders();
            } else {
                WOTM_APP.showToast('Error: ' + response.data.message);
            }
        }).fail(function() {
            WOTM_APP.showToast('An AJAX error occurred.');
        }).always(function() {
            button.prop('disabled', false).text('Create Order');
        });
    });

    // Send SMS action button handler
    $(document).on('click', '#send-sms-action-button', function() {
        var button = $(this);
        var toNumber = $('#sms-to-number').val().trim();
        var message = $('#sms-message').val().trim();

        if (!toNumber) {
            WOTM_APP.showToast('Please enter a recipient number.');
            return;
        }
        if (!message) {
            WOTM_APP.showToast('Please enter a message.');
            return;
        }

        button.text('Sending...').prop('disabled', true);

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_send_manual_sms',
            security: WOTM_APP.ajaxNonce,
            to: toNumber,
            msg: message
        }, function(response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.showToast('SMS sent successfully!');
                $('#sms-to-number').val('');
                $('#sms-message').val('');
                $('#send-sms-dropdown').hide();
            } else {
                var errMsg = (response.data && response.data.message) ? response.data.message : (typeof response.data === 'string' ? response.data : 'Unknown error');
                WOTM_APP.showToast('Error sending SMS: ' + errMsg);
            }
        }).fail(function() {
            WOTM_APP.showToast('An AJAX error occurred while sending SMS.');
        }).always(function() {
            button.text('Send').prop('disabled', false);
        });
    });

    // Apply filters handler
    $('#apply-filters').on('click', function() {
        WOTM_APP.currentPage = 1;
        $('#filter-dropdown').hide();
        otmSyncMainFilterButton();
        WOTM_APP.loadOrders();
    });

    // Clear filters handler
    $(document).on('click', '#clear-filters-button', function() {
        otmClearOrderListFilterFields();
        $('#filter-dropdown').hide();
        otmSyncMainFilterButton();
        WOTM_APP.currentPage = 1;
        WOTM_APP.loadOrders();
    });

    // Product filter suggestions
    var productFilterTimeout;
    $(document).on('input', '#product-filter', function() {
        var input = $(this);
        var suggestionsDiv = $('#product-filter-suggestions');
        var term = input.val().trim();

        if (term.length === 0) {
            $('#product-filter-id').val('');
        }

        clearTimeout(productFilterTimeout);

        if (term.length < 2) {
            suggestionsDiv.hide().empty();
            return;
        }

        productFilterTimeout = setTimeout(function() {
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_search_products_for_filter',
                security: WOTM_APP.ajaxNonce,
                term: term
            }, function(response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    var html = '<ul>';
                    response.data.products.forEach(function(product) {
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

    $(document).on('click', '#product-filter-suggestions li', function(event) {
        event.stopPropagation();
        var selectedLi = $(this);
        var productName = selectedLi.text();
        var productId = selectedLi.data('product-id');
        $('#product-filter').val(productName);
        $('#product-filter-id').val(productId);
        $('#product-filter-suggestions').hide().empty();
    });

    // Bulk SMS product search
    var bulkSmsProductTimeout;
    $(document).on('input', '#bulk-sms-product', function() {
        var suggestionsDiv = $('#bulk-sms-product-suggestions');
        var term = $(this).val().trim();
        if (term.length === 0) $('#bulk-sms-product-id').val('');
        clearTimeout(bulkSmsProductTimeout);
        if (term.length < 2) {
            suggestionsDiv.hide().empty();
            return;
        }
        bulkSmsProductTimeout = setTimeout(function() {
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_search_products_for_filter',
                security: WOTM_APP.ajaxNonce,
                term: term
            }, function(response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    var html = '<ul>';
                    response.data.products.forEach(function(product) {
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
    $(document).on('click', '#bulk-sms-product-suggestions li', function(event) {
        event.stopPropagation();
        var productName = $(this).text();
        var productId = $(this).data('product-id');
        $('#bulk-sms-product').val(productName);
        $('#bulk-sms-product-id').val(productId);
        $('#bulk-sms-product-suggestions').hide().empty();
    });

    // Hide suggestions when clicking outside
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.filter-option').length) {
            $('#product-filter-suggestions').hide().empty();
        }
        if (!$(e.target).closest('#bulk-sms-dropdown .filter-option').length) {
            $('#bulk-sms-product-suggestions').hide().empty();
        }
    });

    // Bulk SMS: Get count
    $(document).on('click', '#bulk-sms-get-count', function() {
        if (typeof all_order_list_params === 'undefined' || typeof WOTM_APP === 'undefined') {
            return;
        }
        var btn = $(this);
        var resultEl = $('#bulk-sms-count-result');
        var productId = $('#bulk-sms-product-id').val();
        var productName = $('#bulk-sms-product').val();
        var zoneVal = $('#bulk-sms-zone-value').val();
        var filters = {
            date_from: $('#bulk-sms-date-from').val() || '',
            date_to: $('#bulk-sms-date-to').val() || '',
            order_from: $('#bulk-sms-order-from').val() || '',
            order_to: $('#bulk-sms-order-to').val() || '',
            product: productId ? String(productId) : (productName || ''),
            category: $('#bulk-sms-category').val() || '',
            zone: zoneVal || ''
        };
        btn.prop('disabled', true);
        resultEl.hide().text('');
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_bulk_sms_recipient_count',
            security: WOTM_APP.ajaxNonce,
            status: $('#bulk-sms-status').val() || 'all',
            filters: filters,
            search: ''
        }).done(function(response) {
            if (response.data && response.data.new_nonce && typeof WOTM_APP.updateNonce === 'function') {
                WOTM_APP.updateNonce(response.data.new_nonce);
            }
            if (response.success && response.data && typeof response.data.order_count !== 'undefined' && typeof response.data.unique_phone_count !== 'undefined') {
                var o = response.data.order_count;
                var p = response.data.unique_phone_count;
                resultEl.attr('data-count-received', '1').text(o + ' order(s), ' + p + ' unique number(s). SMS will be sent to ' + p + ' recipient(s).').show();
                if (typeof updateBulkSmsBanglaState === 'function') {
                    updateBulkSmsBanglaState();
                }
            } else {
                var errMsg = (response.data && response.data.message) ? response.data.message : 'Unknown error';
                resultEl.removeAttr('data-count-received').text('Error: ' + errMsg).show();
            }
        }).fail(function() {
            resultEl.removeAttr('data-count-received').text('Request failed. Check your connection and try again.').show();
        }).always(function() {
            btn.prop('disabled', false);
        });
    });

    // When bulk SMS filters change, clear count so user must click "Get count" again before Send
    $(document).on('change input', '#bulk-sms-date-from, #bulk-sms-date-to, #bulk-sms-order-from, #bulk-sms-order-to, #bulk-sms-category, #bulk-sms-status', function() {
        if ($('#bulk-sms-dropdown').is(':visible')) {
            clearBulkSmsCountReceived();
        }
    });
    $(document).on('change input', '#bulk-sms-zone-value, #bulk-sms-zone-input', function() {
        if ($('#bulk-sms-dropdown').is(':visible')) {
            clearBulkSmsCountReceived();
        }
    });
    $(document).on('input', '#bulk-sms-product, #bulk-sms-product-id', function() {
        if ($('#bulk-sms-dropdown').is(':visible')) {
            clearBulkSmsCountReceived();
        }
    });

    // Bulk SMS: Send (batched, max 100 per request; progress e.g. 100/20000)
    var BULK_SMS_BATCH_SIZE = 100;
    $(document).on('click', '#bulk-sms-send-btn', function() {
        var btn = $(this);
        var resultEl = $('#bulk-sms-count-result');
        var productId = $('#bulk-sms-product-id').val();
        var productName = $('#bulk-sms-product').val();
        var zoneVal = $('#bulk-sms-zone-value').val();
        var message = $('#bulk-sms-message').val().trim();
        if (!message) {
            WOTM_APP.showToast('Please enter a message.');
            return;
        }
        if (!hasBanglaCharacter(message)) {
            WOTM_APP.showToast('According to government rules, bulk SMS must include at least one Bangla character.');
            return;
        }
        var filters = {
            date_from: $('#bulk-sms-date-from').val(),
            date_to: $('#bulk-sms-date-to').val(),
            order_from: $('#bulk-sms-order-from').val(),
            order_to: $('#bulk-sms-order-to').val(),
            product: productId ? productId : productName,
            category: $('#bulk-sms-category').val(),
            zone: zoneVal || ''
        };
        btn.prop('disabled', true).text('Sending...');
        var totalRecipients = null;
        var sentSoFar = 0;
        var batchIndex = 0;

        function sendNextBatch() {
            $.post(all_order_list_params.ajax_url, {
                action: 'otm_send_bulk_sms_batch',
                security: WOTM_APP.ajaxNonce,
                status: $('#bulk-sms-status').val(),
                filters: filters,
                search: '',
                message: message,
                batch_index: batchIndex,
                batch_size: BULK_SMS_BATCH_SIZE
            }, function(response) {
                if (response.success) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    if (response.data.total_recipients != null) totalRecipients = response.data.total_recipients;
                    sentSoFar += response.data.sent_in_batch || 0;
                    resultEl.text(sentSoFar + (totalRecipients != null ? '/' + totalRecipients : '') + ' sent').show();
                    if (totalRecipients != null) {
                        btn.text('Sending ' + sentSoFar + '/' + totalRecipients);
                    }
                    if (totalRecipients != null && sentSoFar >= totalRecipients) {
                        WOTM_APP.showToast(response.data.message || 'Bulk SMS sent to ' + sentSoFar + ' recipient(s).');
                        $('#bulk-sms-dropdown').hide();
                        btn.prop('disabled', false).text('Send SMS');
                        return;
                    }
                    batchIndex++;
                    sendNextBatch();
                } else {
                    WOTM_APP.showToast('Error: ' + (response.data && response.data.message ? response.data.message : 'Failed'));
                    btn.prop('disabled', false).text('Send SMS');
                }
            }).fail(function() {
                WOTM_APP.showToast('Request failed.');
                btn.prop('disabled', false).text('Send SMS');
            });
        }
        sendNextBatch();
    });

    // Pagination handler
    $(document).on('click', '.page-button', function(){
        WOTM_APP.currentPage = $(this).data('page');
        WOTM_APP.loadCurrentTabData();
    });

    // Export to CSV handler
    $(document).on('click', '#export-csv-button', function() {
        var button = $(this);
        button.text('Exporting...').prop('disabled', true);

        var visibleColumns = WOTM_APP.getVisibleColumnKeys();

        var productId = $('#product-filter-id').val();
        var productName = $('#product-filter').val();
        var filters = {
            date_from: $('#date-range-from').val(),
            date_to: $('#date-range-to').val(),
            order_from: $('#order-range-from').val(),
            order_to: $('#order-range-to').val(),
            product: productId ? productId : productName,
            category: $('#category-filter').val(),
            zone: $('#filter-zone-value').val() || ''
        };

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_export_orders_csv',
            security: WOTM_APP.ajaxNonce,
            status: WOTM_APP.currentTab,
            filters: filters,
            search: WOTM_APP.searchTerm,
            sort_by: WOTM_APP.sortBy,
            sort_order: WOTM_APP.sortOrder,
            columns: visibleColumns
        }, function(response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                
                var csvData = response.data.csv_data;
                var blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
                var link = document.createElement("a");
                
                if (link.download !== undefined) { // feature detection
                    var url = URL.createObjectURL(blob);
                    var today = new Date();
                    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
                    link.setAttribute("href", url);
                    link.setAttribute("download", "orders-export-" + date + ".csv");
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
                WOTM_APP.showToast('Export successful!');
                if (response.data.notice) {
                    setTimeout(function() { WOTM_APP.showToast(response.data.notice); }, 3100); // Show notice after first toast fades
                }
            } else {
                WOTM_APP.showToast('Error: ' + response.data);
            }
        }).fail(function() {
            WOTM_APP.showToast('An AJAX error occurred during export.');
        }).always(function() {
            button.text('Export to CSV').prop('disabled', false);
        });
    });

    $(window).on('resize', WOTM_APP.handleTabsResponsive);

    $(document).on('change', '#tab-dropdown', function() {
        WOTM_APP.currentTab = $(this).val();
        WOTM_APP.currentPage = 1;
        WOTM_APP.searchMode = false;
        WOTM_APP.loadOrders();
    });

    // Mobile "More" toolbar toggle
    $('#otm-more-btn').on('click', function() {
        var $container = $('.search-container');
        var isOpen = $container.toggleClass('otm-more-open').hasClass('otm-more-open');
        $(this).html(isOpen
            ? 'More ' + otmIcon('chevron-up')
            : 'More ' + otmIcon('chevron-down'));
    });

    // Order Summary Modal
    var otmSummaryInit = false;

    function otmLoadSummary() {
        var status = $('#otm-summary-status').val();
        if (!status) return;
        $('#otm-summary-results').html('<div class="otm-summary-loading">' + otmIcon('sync-alt', 'otm-spin otm-icon') + ' Loading...</div>');
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_order_summary',
            security: all_order_list_params.nonce,
            status: status
        }, function(response) {
            if (!response.success) {
                $('#otm-summary-results').html('<p class="otm-summary-error">Could not load summary. Please try again.</p>');
                return;
            }
            if (response.data.new_nonce) {
                WOTM_APP.updateNonce && WOTM_APP.updateNonce(response.data.new_nonce);
            }
            var data = response.data;
            var html = '<div class="otm-summary-total">Total Orders: <strong>' + data.total_orders + '</strong></div>';
            if (data.total_orders === 0 || !data.products || Object.keys(data.products).length === 0) {
                html += '<p class="otm-summary-empty">No orders found for the selected status.</p>';
            } else {
                html += '<div class="otm-summary-product-wrap"><table class="otm-summary-product-table">';
                html += '<thead><tr><th>#</th><th>Product</th><th>Qty</th></tr></thead><tbody>';
                var i = 1;
                $.each(data.products, function(name, qty) {
                    html += '<tr><td>' + i + '</td><td>' + $('<div>').text(name).html() + '</td><td>' + qty + '</td></tr>';
                    i++;
                });
                html += '</tbody></table></div>';
            }
            $('#otm-summary-results').html(html);
        }).fail(function() {
            $('#otm-summary-results').html('<p class="otm-summary-error">An error occurred. Please try again.</p>');
        });
    }

    $('#otm-order-summary-btn').on('click', function() {
        if (!otmSummaryInit) {
            var statuses = (typeof all_order_list_params !== 'undefined' && all_order_list_params.order_summary_statuses) ? all_order_list_params.order_summary_statuses : {};
            $.each(statuses, function(key, label) {
                var selected = key === 'wc-otm-confirmed' ? ' selected' : '';
                $('#otm-summary-status').append('<option value="' + key + '"' + selected + '>' + label + '</option>');
            });
            otmSummaryInit = true;
        }
        $('#otm-order-summary-modal').show();
        otmLoadSummary();
    });

    $('#otm-order-summary-close').on('click', function() {
        $('#otm-order-summary-modal').hide();
    });

    $(document).on('click', '#otm-order-summary-modal', function(e) {
        if ($(e.target).is('#otm-order-summary-modal')) {
            $(this).hide();
        }
    });

    $(document).on('change', '#otm-summary-status', function() {
        otmLoadSummary();
    });

})(jQuery);