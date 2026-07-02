var WOTM_APP = {};

(function($) {
    // Initialize variables
    WOTM_APP.currentTab;
    WOTM_APP.currentPage = 1;
    WOTM_APP.searchTerm = '';
    WOTM_APP.perPage = 30;
    WOTM_APP.ajaxNonce = all_order_list_params.nonce;
    WOTM_APP.searchTimer;
    WOTM_APP.searchMode = false;
    WOTM_APP.sortBy = 'order_date';
    WOTM_APP.sortOrder = 'DESC';
    WOTM_APP.otm_tabs = {}; // Will hold tab data (label+count)
    WOTM_APP.tabBaseLabels = {}; // Will hold raw tab labels without counts
    window.otm_last_product_search_response = null;
    WOTM_APP.courierZones = {}; // To hold zone data for the active courier

    // --- PROFIT/LOSS MODE ---
    WOTM_APP.isProfitLossMode = all_order_list_params.profit_loss_enabled;
    WOTM_APP.onlyMissingPlView = false;
    WOTM_APP.plSummaryAdCost = '';
    WOTM_APP.plSummarySum = 0;
    WOTM_APP.plSummaryData = null;
    WOTM_APP.plStatuses = ['wc-otm-delivered', 'wc-otm-partial-del', 'wc-otm-returned'];
    WOTM_APP.plStatusLabels = {
        'wc-otm-delivered': 'Delivered',
        'wc-otm-partial-del': 'Partial Delivered',
        'wc-otm-returned': 'Returned'
    };
    WOTM_APP.plOnlyMissingStorageKey = 'wotm_pl_only_missing_view';
    WOTM_APP.isSwitchingToPreferredMissingTab = false;

    WOTM_APP.getPersistedOnlyMissingPlView = function() {
        try {
            return window.localStorage && window.localStorage.getItem(WOTM_APP.plOnlyMissingStorageKey) === '1';
        } catch (e) {
            return false;
        }
    };
    WOTM_APP.persistOnlyMissingPlView = function(enabled) {
        try {
            if (!window.localStorage) return;
            if (enabled) {
                window.localStorage.setItem(WOTM_APP.plOnlyMissingStorageKey, '1');
            } else {
                window.localStorage.removeItem(WOTM_APP.plOnlyMissingStorageKey);
            }
        } catch (e) {}
    };
    WOTM_APP.setOnlyMissingPlView = function(enabled) {
        WOTM_APP.onlyMissingPlView = !!enabled;
        WOTM_APP.persistOnlyMissingPlView(WOTM_APP.onlyMissingPlView);
    };
    WOTM_APP.applyCurrentTabSelectionUi = function() {
        $('.tab-btn').removeClass('active');
        $('.tab-btn[data-tab="' + WOTM_APP.currentTab + '"]').addClass('active');
        var $dropdown = $('#tab-dropdown');
        if ($dropdown.length) {
            $dropdown.val(WOTM_APP.currentTab);
        }
    };
    WOTM_APP.switchToPreferredMissingTab = function(summaryData, triggerReload) {
        if (!WOTM_APP.isProfitLossMode || !WOTM_APP.onlyMissingPlView || !summaryData) {
            return false;
        }
        var preferred = summaryData.first_missing_status || '';
        if (!preferred || WOTM_APP.plStatuses.indexOf(preferred) === -1) {
            return false;
        }
        if (preferred === WOTM_APP.currentTab) {
            return false;
        }
        WOTM_APP.currentTab = preferred;
        WOTM_APP.currentPage = 1;
        WOTM_APP.applyCurrentTabSelectionUi();
        if (triggerReload) {
            WOTM_APP.isSwitchingToPreferredMissingTab = true;
            WOTM_APP.loadOrders();
        }
        return true;
    };
    if (WOTM_APP.isProfitLossMode && WOTM_APP.getPersistedOnlyMissingPlView()) {
        WOTM_APP.onlyMissingPlView = true;
    }

    WOTM_APP.updateUiForProfitLossMode = function() {
        var btn = $('#otm-profit-loss-toggle-btn');
        var checkbox = $('#otm-profit-loss-toggle-checkbox');
        var cardId = 'otm-profit-loss-card';

        if (WOTM_APP.isProfitLossMode) {
            btn.addClass('active');
            checkbox.prop('checked', true);
            WOTM_APP.onlyMissingPlView = WOTM_APP.getPersistedOnlyMissingPlView();

            // Show only P/L tabs; inject any missing ones
            WOTM_APP.applyPlTabFilter();
            WOTM_APP.handleTabsResponsive();

            // Inject summary card inside .otm-tab-summary-row (to the right of tabs)
            if (!$('#' + cardId).length) {
                var cardHtml = '<div id="' + cardId + '" class="otm-pl-summary-card">' +
                    '<div id="otm-pl-summary-block"></div>' +
                    '</div>';
                $('.otm-tab-summary-row').append(cardHtml);
            }
            WOTM_APP.fetchPlSummaryAndUpdateBlock();
        } else {
            btn.removeClass('active');
            checkbox.prop('checked', false);
            $('#' + cardId).remove();
            WOTM_APP.plSummaryAdCost = '';
            WOTM_APP.plSummarySum = 0;
            WOTM_APP.setOnlyMissingPlView(false);
            $('#otm-pl-accuracy-notice').remove();
            // Restore all tabs
            $('.tab-btn').show();
            $('.tab-btn[data-otm-pl-injected]').remove();
            // If current tab was a P/L-injected tab (no longer exists) or P/L-only,
            // switch to the first visible tab
            var stillExists = $('.tab-btn[data-tab="' + WOTM_APP.currentTab + '"]:visible').length;
            if (!stillExists) {
                var $firstVisible = $('.tab-btn:visible').first();
                if ($firstVisible.length) {
                    WOTM_APP.currentTab = $firstVisible.data('tab');
                    $('.tab-btn').removeClass('active');
                    $firstVisible.addClass('active');
                }
            }
            WOTM_APP.handleTabsResponsive();
        }
    };

    WOTM_APP.applyPlTabFilter = function() {
        var plStatuses = WOTM_APP.plStatuses;

        // Hide non-P/L tabs
        $('.tab-btn').each(function() {
            var tab = $(this).data('tab');
            if (plStatuses.indexOf(tab) === -1) {
                $(this).hide();
            } else {
                $(this).show();
            }
        });

        // Inject any P/L tabs that don't exist in the tab bar
        plStatuses.forEach(function(status) {
            if (!$('.tab-btn[data-tab="' + status + '"]').length) {
                var label = WOTM_APP.plStatusLabels[status] || status;
                // Use stored tab count if available
                var cnt = WOTM_APP.plTabCounts && WOTM_APP.plTabCounts[status] !== undefined
                    ? ' (' + WOTM_APP.plTabCounts[status] + ')'
                    : '';
                var $btn = $('<button class="tab-btn" data-tab="' + status + '" data-otm-pl-injected="1">' + label + cnt + '</button>');
                $('.tab-buttons').append($btn);
            }
        });

        // If current tab is not a P/L tab, switch to first P/L tab
        if (plStatuses.indexOf(WOTM_APP.currentTab) === -1) {
            var firstPlTab = $('.tab-btn[data-tab="wc-otm-delivered"]').length
                ? 'wc-otm-delivered'
                : (plStatuses[0] || '');
            if (firstPlTab) {
                WOTM_APP.currentTab = firstPlTab;
                $('.tab-btn').removeClass('active');
                $('.tab-btn[data-tab="' + firstPlTab + '"]').addClass('active');
            }
        }
    };

    // Render summary card + notice from a plain data object (no AJAX needed)
    WOTM_APP.renderPlSummaryFromData = function(data) {
        var block = $('#otm-pl-summary-block');
        if (!block.length) return;

        WOTM_APP.renderPlAccuracyNotice(data);
        WOTM_APP.plSummaryData = data || null;

        var hasMissing = data.has_any_missing;
        var sum = parseFloat(data.profit_loss_sum) || 0;
        WOTM_APP.plSummarySum = sum;
        var sym = all_order_list_params.currency_symbol || '';

        if (WOTM_APP.onlyMissingPlView) {
            block.html('<div class="otm-pl-actions-inline"><span>Showing only orders with missing data.</span><button type="button" class="otm-pl-action-btn" id="otm-pl-show-all-orders-btn">Show all orders</button></div>');
        } else if (hasMissing) {
            block.html('<div class="otm-pl-actions-inline"><span>Some orders have missing data that should be fixed.</span><button type="button" class="otm-pl-action-btn" id="otm-pl-fix-it-btn">Fix it</button></div>');
        } else {
            var adVal = WOTM_APP.plSummaryAdCost === '' ? '' : parseFloat(WOTM_APP.plSummaryAdCost);
            var net = isNaN(adVal) ? sum : (sum - adVal);
            var adDisplay = WOTM_APP.plSummaryAdCost === '' ? '' : WOTM_APP.plSummaryAdCost;
            block.html(
                '<div class="otm-pl-summary-inline">' +
                '<div class="otm-pl-summary-item"><strong>Sum:</strong><span id="otm-pl-sum-value">' + sym + sum.toFixed(2) + '</span></div>' +
                '<div class="otm-pl-summary-item"><strong>Ad Cost:</strong><input type="number" step="0.01" min="0" id="otm-pl-ad-cost-input" value="' + (adDisplay !== '' ? adDisplay : '') + '" placeholder="0"></div>' +
                '<div class="otm-pl-summary-item"><strong>Net Profit:</strong><span id="otm-pl-net-value" class="otm-pl-net-' + (net >= 0 ? 'positive' : 'negative') + '">' + sym + net.toFixed(2) + '</span></div>' +
                '</div>'
            );
            $('#otm-pl-ad-cost-input').on('input', function() {
                WOTM_APP.plSummaryAdCost = $(this).val();
                var ad = WOTM_APP.plSummaryAdCost === '' ? 0 : parseFloat(WOTM_APP.plSummaryAdCost);
                var n = isNaN(ad) ? WOTM_APP.plSummarySum : (WOTM_APP.plSummarySum - ad);
                var $net = $('#otm-pl-net-value');
                $net.text(sym + n.toFixed(2)).removeClass('otm-pl-net-positive otm-pl-net-negative').addClass(n >= 0 ? 'otm-pl-net-positive' : 'otm-pl-net-negative');
            });
        }
    };

    // Fallback: fetch summary via separate AJAX call (used only when pl_summary not in loadOrders response)
    WOTM_APP.fetchPlSummaryAndUpdateBlock = function() {
        var block = $('#otm-pl-summary-block');
        if (!block.length) return;
        block.html('<span style="color:#666;">Loading summary...</span>');
        var productId = $('#product-filter-id').val();
        var productName = $('#product-filter').val();
        var summaryFilters = {
            date_from:  $('#date-range-from').val() || '',
            date_to:    $('#date-range-to').val() || '',
            order_from: $('#order-range-from').val() || '',
            order_to:   $('#order-range-to').val() || '',
            product:    productId ? productId : (productName || ''),
            category:   $('#category-filter').val() || '',
            assignee:   $('#assignee-filter').val() || '',
            zone:       $('#filter-zone-value').val() || ''
        };
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_pl_summary',
            security: WOTM_APP.ajaxNonce,
            filters: summaryFilters,
            status: WOTM_APP.currentTab || ''
        }, function(response) {
            if (!response.success) {
                block.html('<span style="color:#c00;">Summary unavailable</span>');
                return;
            }
            WOTM_APP.updateNonce(response.data.new_nonce);
            if (WOTM_APP.onlyMissingPlView && WOTM_APP.switchToPreferredMissingTab(response.data, true)) {
                return;
            }
            WOTM_APP.renderPlSummaryFromData(response.data);
        }).fail(function() {
            block.html('<span style="color:#c00;">Summary unavailable</span>');
        });
    };

    /** After inline edits to P/L inputs, reload summary so the "missing data" banner can clear. */
    WOTM_APP.refreshPlSummaryIfPlDataChanged = function(metaKey) {
        var plKeys = ['production_cost', 'production_cost_on_return', 'delivery_charge', 'courier_cod', 'loss_on_partial_delivery', 'advance_paid_amount', 'order_total'];
        if (!WOTM_APP.isProfitLossMode || !$('#otm-profit-loss-card').length) {
            return;
        }
        if (metaKey && plKeys.indexOf(metaKey) === -1) {
            return;
        }
        if (typeof WOTM_APP.fetchPlSummaryAndUpdateBlock === 'function') {
            WOTM_APP.fetchPlSummaryAndUpdateBlock();
        }
    };

    WOTM_APP.renderPlAccuracyNotice = function(data) {
        var noticeId = 'otm-pl-accuracy-notice';
        var cutoff   = data.cutoff_date || null;
        var pending  = parseInt(data.pending_count) || 0;
        var dateTo   = $('#date-range-to').val() || '';

        // Format date Y-m-d → d M Y (e.g. 24 Mar 2026)
        function fmtDate(ymd) {
            if (!ymd) return '';
            var parts = ymd.split('-');
            if (parts.length !== 3) return ymd;
            var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return parseInt(parts[2]) + ' ' + (months[parseInt(parts[1]) - 1] || '') + ' ' + parts[0];
        }

        // [B date]: date_to filter or today
        var bDate = dateTo || (function() {
            var d = new Date();
            return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
        })();

        var $existing = $('#' + noticeId);

        // If no cutoff or no pending — remove notice if exists
        if (!cutoff || pending === 0) {
            $existing.remove();
            return;
        }

        var aFormatted = fmtDate(cutoff);
        var bFormatted = fmtDate(bDate);

        var html = '<div id="' + noticeId + '" class="otm-pl-accuracy-notice" role="alert">' +
            '<span class="otm-pl-accuracy-notice-text">' +
            '⚠️ For 100% accurate results, filter up to <strong>' + aFormatted + '</strong>. ' +
            '<strong>' + pending + ' order' + (pending !== 1 ? 's' : '') + '</strong>' +
            ' up to <strong>' + bFormatted + '</strong> are still pending courier completion.' +
            '</span>' +
            '<button type="button" class="otm-pl-accuracy-notice-close" aria-label="Dismiss">×</button>' +
            '</div>';

        if ($existing.length) {
            $existing.replaceWith(html);
        } else {
            $('#otm-app-container').prepend(html);
        }
    };

    // Dismiss notice click (delegated — notice is re-rendered on each summary refresh)
    $(document).on('click', '.otm-pl-accuracy-notice-close', function() {
        $('#otm-pl-accuracy-notice').remove();
    });

    $(document).on('click', '#otm-pl-fix-it-btn', function() {
        WOTM_APP.setOnlyMissingPlView(true);
        if (WOTM_APP.plSummaryData) {
            WOTM_APP.switchToPreferredMissingTab(WOTM_APP.plSummaryData, false);
        }
        WOTM_APP.loadOrders();
    });
    $(document).on('click', '#otm-pl-show-all-orders-btn', function() {
        WOTM_APP.setOnlyMissingPlView(false);
        WOTM_APP.loadOrders();
    });
    
    // Returns column keys to display: in Profit/Loss mode all columns; otherwise exclude Profit/Loss-only columns.
    WOTM_APP.getVisibleColumnKeys = function() {
        var keys = Object.keys(typeof otm_column_data !== 'undefined' ? otm_column_data : {});
        keys = keys.filter(function(k) { return k !== 'match'; });
        if (WOTM_APP.currentTab === 'wc-otm-zone-chan') {
            var slIdx = keys.indexOf('sl');
            var ins = slIdx !== -1 ? slIdx + 1 : 0;
            keys.splice(ins, 0, 'match');
        }
        if (!WOTM_APP.isProfitLossMode) {
            var hideKeys = (typeof otm_profit_loss_only_columns !== 'undefined' && Array.isArray(otm_profit_loss_only_columns)) ? otm_profit_loss_only_columns : [];
            keys = keys.filter(function(k) { return hideKeys.indexOf(k) === -1; });
        }
        if (typeof all_order_list_params !== 'undefined' && all_order_list_params.hide_assignee_column) {
            keys = keys.filter(function(k) { return k !== 'assignee'; });
        }
        return keys;
    };

    /** Columns that use non-editable cell markup (must match PHP order table). */
    var WOTM_NON_EDITABLE_ORDER_COLUMNS = ['order_id', 'order_date', 'products', 'tracking_updates', 'block', 'track', 'bulk_action', 'sl', 'match', 'status', 'customer_note', 'last_modified', 'assignee', 'send_to_courier', 'courier_status', 'courier_edit', 'zone', 'payable_amount', 'profit_loss', 'invoice', 'courier_rate', 'first_touch_utm', 'last_touch_utm'];

    // --- END PROFIT/LOSS MODE ---

    WOTM_APP.loadCategories = function() {
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
                $('#category-filter').html(options);
            } else {
                WOTM_APP.showToast('Error loading categories.');
            }
        }).fail(function() {
            WOTM_APP.showToast('Error loading categories.');
        });
    }

    WOTM_APP.showToast = function(message) {
        var toast = $('#otm-toast');
        toast.text(message);
        toast.addClass('show');
        setTimeout(function(){ toast.removeClass('show'); }, 3000);
    }

    WOTM_APP.updateNonce = function(newNonce) {
        if (newNonce) {
            WOTM_APP.ajaxNonce = newNonce;
        }
    }

    WOTM_APP.loadTabsAndOrders = function() {
        $.post(all_order_list_params.ajax_url, {
            action: 'otm_get_tabs',
            security: WOTM_APP.ajaxNonce,
        }, function(response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.otm_tabs = response.data.tabs;
                var tabCounts = response.data.tab_counts || {};
                WOTM_APP.plTabCounts = tabCounts;

                // Store raw base labels before appending counts
                for (var slug in WOTM_APP.otm_tabs) {
                    if (WOTM_APP.otm_tabs.hasOwnProperty(slug)) {
                        WOTM_APP.tabBaseLabels[slug] = WOTM_APP.otm_tabs[slug];
                    }
                }

                // Embed order count into each label so both desktop and mobile views show it
                for (var slug in WOTM_APP.otm_tabs) {
                    if (WOTM_APP.otm_tabs.hasOwnProperty(slug) && typeof tabCounts[slug] !== 'undefined') {
                        WOTM_APP.otm_tabs[slug] = WOTM_APP.tabBaseLabels[slug] + ' (' + tabCounts[slug] + ')';
                    }
                }

                var tabButtonsHtml = '';
                var firstTab = '';

                for (var key in WOTM_APP.otm_tabs) {
                    if (WOTM_APP.otm_tabs.hasOwnProperty(key)) {
                        if (firstTab === '') {
                            firstTab = key;
                        }
                        tabButtonsHtml += '<button class="tab-btn" data-tab="' + key + '">' + WOTM_APP.otm_tabs[key] + '</button>';
                    }
                }

                $('.tab-buttons').html(tabButtonsHtml);

                // In P/L mode, default to first P/L tab instead of first normal tab
                if (WOTM_APP.isProfitLossMode) {
                    var plStatuses = WOTM_APP.plStatuses;
                    var plFirstTab = '';
                    for (var pi = 0; pi < plStatuses.length; pi++) {
                        if (WOTM_APP.otm_tabs.hasOwnProperty(plStatuses[pi])) {
                            plFirstTab = plStatuses[pi];
                            break;
                        }
                    }
                    WOTM_APP.currentTab = plFirstTab || firstTab;
                } else {
                    WOTM_APP.currentTab = firstTab;
                }
                
                // Set active tab on initial load
                $('.tab-btn[data-tab="' + WOTM_APP.currentTab + '"]').addClass('active');

                // Set initial UI state for P/L mode then load orders
                WOTM_APP.updateUiForProfitLossMode();
                
                WOTM_APP.courierZones = all_order_list_params.zone_data;
                WOTM_APP.loadCurrentTabData();
                if (!WOTM_APP.isProfitLossMode) {
                    WOTM_APP.handleTabsResponsive();
                }
            } else {
                $('.tab-buttons').html('<p>Error loading tabs.</p>');
            }
        }).fail(function() {
            $('.tab-buttons').html('<p>Error loading tabs.</p>');
        });
    }
    
    // Load incomplete orders (legacy: abandoned_carts)
    WOTM_APP.loadAbandonedCarts = function() {
        $('#orders-table-container').html('<div class="loading-indicator">Loading incomplete orders...</div>');
        $.post(all_order_list_params.ajax_url, {
            action: 'load_abandoned_carts',
            security: WOTM_APP.ajaxNonce,
            page: WOTM_APP.currentPage,
            per_page: WOTM_APP.perPage,
            status: 'pending',
            can_assign: all_order_list_params.can_assign,
            sort_by: WOTM_APP.sortBy,
            sort_order: WOTM_APP.sortOrder
        }, function(response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                $('#orders-table-container').html(response.data.html);
                WOTM_APP.initAccordions();
            } else {
                $('#orders-table-container').html('<p>Error loading incomplete orders.</p>');
            }
        }).fail(function() {
            $('#orders-table-container').html('<p>Error loading incomplete orders. Please try again.</p>');
        });
    };

    // Load orders or abandoned carts depending on current tab
    WOTM_APP.loadCurrentTabData = function() {
        if (WOTM_APP.currentTab === 'incomplete_order' || WOTM_APP.currentTab === 'abandoned_carts') {
            WOTM_APP.loadAbandonedCarts();
        } else {
            WOTM_APP.loadOrders();
        }
    };

    // Load orders function
    WOTM_APP.loadOrders = function() {
        if (WOTM_APP.currentTab === 'incomplete_order' || WOTM_APP.currentTab === 'abandoned_carts') {
            WOTM_APP.loadAbandonedCarts();
            return;
        }
        var statusToLoad = WOTM_APP.currentTab;

        if (WOTM_APP.searchMode) {
            WOTM_APP.performSearch();
        } else {
            $('#orders-table-container').html('<div class="loading-indicator">Loading orders...</div>');
            
            var productId = $('#product-filter-id').val();
            var productName = $('#product-filter').val();
            var filters = {
                date_from: $('#date-range-from').val(),
                date_to: $('#date-range-to').val(),
                order_from: $('#order-range-from').val(),
                order_to: $('#order-range-to').val(),
                product: productId ? productId : productName,
                category: $('#category-filter').val(),
                assignee: $('#assignee-filter').val(),
                zone: $('#filter-zone-value').val() || ''
            };

            var postData = {
                action: 'load_filtered_orders',
                security: WOTM_APP.ajaxNonce,
                status: statusToLoad,
                page: WOTM_APP.currentPage,
                per_page: WOTM_APP.perPage,
                search: WOTM_APP.searchTerm,
                is_limited: all_order_list_params.is_limited,
                can_assign: all_order_list_params.can_assign,
                sort_by: WOTM_APP.sortBy,
                sort_order: WOTM_APP.sortOrder,
                filters: filters,
                is_profit_loss_mode: WOTM_APP.isProfitLossMode ? '1' : '0'
            };
            if (WOTM_APP.isProfitLossMode && WOTM_APP.onlyMissingPlView) {
                postData.only_missing_pl = '1';
            }
            $.post(all_order_list_params.ajax_url, postData, function(response) {
                if (response.success) {
                    WOTM_APP.lastOrdersFetchParams = $.extend({}, postData);
                    WOTM_APP.updateNonce(response.data.new_nonce);
                    if (response.data.pl_summary && WOTM_APP.onlyMissingPlView && !response.data.pl_summary.has_any_missing) {
                        WOTM_APP.setOnlyMissingPlView(false);
                        WOTM_APP.loadOrders();
                        return;
                    }
                    if (response.data.pl_summary && WOTM_APP.onlyMissingPlView) {
                        if (WOTM_APP.switchToPreferredMissingTab(response.data.pl_summary, true)) {
                            return;
                        }
                    }
                    $('#orders-table-container').html(response.data.html);
                    WOTM_APP.initAccordions();
                    if (WOTM_APP.currentTab === 'wc-otm-zone-chan' && typeof window.WOTM_ZoneMatch !== 'undefined') {
                        window.WOTM_ZoneMatch.scheduleComputeFromLastParams();
                    }
                    // Tab counts come with the same response — update instantly, no extra AJAX call
                    if (response.data.tab_counts) {
                        WOTM_APP.applyTabCountsToButtons(response.data.tab_counts);
                    }
                    // P/L summary card + notice — use data from same response, no extra AJAX call
                    if (response.data.pl_summary && $('#otm-profit-loss-card').length) {
                        WOTM_APP.renderPlSummaryFromData(response.data.pl_summary);
                    }
                    WOTM_APP.isSwitchingToPreferredMissingTab = false;
                    _runAfterLayout(WOTM_APP.updateOrdersTableScrollWidth);
                } else {
                    WOTM_APP.isSwitchingToPreferredMissingTab = false;
                    $('#orders-table-container').html('<p>Error loading orders: ' + response.data + '</p>');
                }
            }).fail(function() {
                WOTM_APP.isSwitchingToPreferredMissingTab = false;
                $('#orders-table-container').html('<p>Error loading orders. Please try again.</p>');
            });
        }
    }
    
    // New efficient search function
    WOTM_APP.performSearch = function() {
        var statusToLoad = WOTM_APP.currentTab;
        const term = $('#com-search').val().trim();
        if (term.length < 2) {
            WOTM_APP.searchMode = false;
            WOTM_APP.loadOrders();
            return;
        }
        
        $('#orders-table-container').html('<div class="loading-indicator">Searching orders...</div>');
        
        var productId = $('#product-filter-id').val();
        var productName = $('#product-filter').val();
        var filters = {
            date_from: $('#date-range-from').val(),
            date_to: $('#date-range-to').val(),
            order_from: $('#order-range-from').val(),
            order_to: $('#order-range-to').val(),
            product: productId ? productId : productName,
            category: $('#category-filter').val(),
            assignee: $('#assignee-filter').val(),
            zone: $('#filter-zone-value').val() || ''
        };

        var searchPost = {
            action: 'efficient_order_search',
            security: WOTM_APP.ajaxNonce,
            term: term,
            /* Same as load_filtered_orders so lastOrdersFetchParams + zone-match AJAX always see one search field. */
            search: term,
            status: statusToLoad,
            is_limited: all_order_list_params.is_limited,
            sort_by: WOTM_APP.sortBy,
            sort_order: WOTM_APP.sortOrder,
            filters: filters,
            is_profit_loss_mode: WOTM_APP.isProfitLossMode ? '1' : '0'
        };
        $.post(all_order_list_params.ajax_url, searchPost, function(response) {
            if (response.success) {
                WOTM_APP.lastOrdersFetchParams = $.extend({}, searchPost);
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.displaySearchResults(response.data.results, term);
                // Tab counts come with the same response — update instantly, no extra AJAX call
                if (response.data.tab_counts) {
                    WOTM_APP.applyTabCountsToButtons(response.data.tab_counts);
                }
                // P/L summary card + notice — use data from same response, no extra AJAX call
                if (response.data.pl_summary && $('#otm-profit-loss-card').length) {
                    WOTM_APP.renderPlSummaryFromData(response.data.pl_summary);
                }
            } else {
                $('#orders-table-container').html('<p>No orders found</p>');
            }
        }).fail(function() {
            $('#orders-table-container').html('<p>Search failed. Please try again.</p>');
        });
    }

    /** Build Last Modified column HTML from history array (for instant update after send-to-courier etc.) */
    WOTM_APP.buildLastModifiedHtml = function(history) {
        if (!history || history.length === 0) {
            return '-';
        }
        var latestMod = history[0];
        var modDate = new Date(latestMod.time);
        var formattedModDate = ('0' + modDate.getDate()).slice(-2) + '-' + ('0' + (modDate.getMonth() + 1)).slice(-2) + '-' + modDate.getFullYear() + ' ' + ('0' + modDate.getHours()).slice(-2) + ':' + ('0' + modDate.getMinutes()).slice(-2);
        var latestModText = formattedModDate + ' by ' + latestMod.user_name + ': ' + latestMod.change;
        var historyHtml = '';
        history.forEach(function(modEntry) {
            var entryDate = new Date(modEntry.time);
            var formattedEntryDate = ('0' + entryDate.getDate()).slice(-2) + '-' + ('0' + (entryDate.getMonth() + 1)).slice(-2) + '-' + entryDate.getFullYear() + ' ' + ('0' + entryDate.getHours()).slice(-2) + ':' + ('0' + entryDate.getMinutes()).slice(-2);
            historyHtml += '<p><strong>' + modEntry.user_name + '</strong> (' + formattedEntryDate + '):<br>' + modEntry.change + '</p>';
        });
        return '<div class="tracking-accordion">' +
            '<button class="accordion"><span class="accordion-text">' + latestModText + '</span></button>' +
            '<div class="panel" style="display:none;">' + historyHtml + '</div>' +
            '</div>';
    };

    /** Multiline "label: value" rows (from PHP) → Last Modified–style attribution accordion. */
    WOTM_APP.buildAttributionAccordionHtml = function(multilineText) {
        if (!multilineText || multilineText === '-') {
            return '-';
        }
        var lines = String(multilineText).split('\n').filter(function(l) { return l.trim().length; });
        if (!lines.length) {
            return '-';
        }
        var items = [];
        lines.forEach(function(line) {
            var idx = line.indexOf(': ');
            if (idx === -1) {
                return;
            }
            items.push({ label: line.slice(0, idx), value: line.slice(idx + 2) });
        });
        if (!items.length) {
            return otmEscapeHtml(String(multilineText));
        }
        var summaryParts = [];
        var maxLen = 48;
        for (var si = 0; si < Math.min(2, items.length); si++) {
            var v = items[si].value;
            if (v.length > maxLen) {
                v = v.slice(0, maxLen) + '…';
            }
            summaryParts.push(items[si].label + ': ' + v);
        }
        var summary = summaryParts.join(' · ');
        var panel = '';
        items.forEach(function(it) {
            var valHtml = it.value ? it.value.split('\n').map(function(part) { return otmEscapeHtml(part); }).join('<br>') : '';
            panel += '<p><strong>' + otmEscapeHtml(it.label) + ':</strong> ' + valHtml + '</p>';
        });
        return '<div class="tracking-accordion">' +
            '<button class="accordion"><span class="accordion-text">' + otmEscapeHtml(summary) + '</span></button>' +
            '<div class="panel" style="display:none;">' + panel + '</div>' +
            '</div>';
    };

    function otmEscapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Inner HTML for one order table cell (shared by search results builder and live row sync).
     */
    WOTM_APP.buildOrderCellInnerHtml = function(key, order, is_editable, slIndex) {
        var html = '';
        if (is_editable) {
            var cellVal = order[key];
            if (key === 'advance_paid_amount') {
                cellVal = (cellVal == null || cellVal === '') ? 0 : cellVal;
            } else if (key === 'loss_on_partial_delivery') {
                cellVal = (cellVal == null || cellVal === '') ? '-' : cellVal;
            } else {
                cellVal = (order[key] != null && order[key] !== '' ? order[key] : '-');
            }
            var cellPrefix = (key === 'order_total' && typeof all_order_list_params !== 'undefined' && all_order_list_params.currency_symbol) ? all_order_list_params.currency_symbol : '';
            html += '<span class="cell-data">' + cellPrefix + cellVal + '</span>';
            html += '<span class="edit-cell-icon">' + otmIcon('pencil-alt', 'otm-icon') + '</span>';
            return html;
        }
        switch (key) {
            case 'sl':
                return String(slIndex != null ? slIndex + 1 : '');
            case 'match':
                if (order.match_html) {
                    return order.match_html;
                }
                return '<span class="otm-zone-match-placeholder">—</span>';
            case 'assignee':
                html += '<div class="flex-container">';
                if (all_order_list_params.can_assign) {
                    html += '<input type="checkbox" class="assignee-checkbox margin-right-5" value="' + order.id + '">';
                    html += '<select class="otm-assign-staff-dropdown" data-order-id="' + order.id + '">';
                    html += '<option value="0">Unassigned</option>';
                    all_order_list_params.staff_users.forEach(function(staff) {
                        var selected = order.assignee_id == staff.ID ? ' selected' : '';
                        html += '<option value="' + staff.ID + '"' + selected + '>' + staff.display_name + '</option>';
                    });
                    html += '</select>';
                } else {
                    html += (order.assignee || '-');
                }
                html += '</div>';
                return html;
            case 'last_modified':
                return WOTM_APP.buildLastModifiedHtml(order.last_modified_history);
            case 'customer_note':
                html += '<div class="note-display">';
                if (!order.note_history || order.note_history.length === 0) {
                    html += '<div class="tracking-accordion">';
                    html += '<button class="accordion"><span class="accordion-text">' + (order.customer_note || '') + '</span></button>';
                    html += '<div class="panel" style="display:none;"><p>' + (order.customer_note ? order.customer_note.replace(/\n/g, '<br>') : '') + '</p></div>';
                    html += '</div>';
                } else {
                    var latestNote = order.note_history[0];
                    var noteHistoryHtml = '';
                    order.note_history.forEach(function(noteEntry) {
                        var noteDate = new Date(noteEntry.time);
                        var formattedDate = ('0' + noteDate.getDate()).slice(-2) + '-' + ('0' + (noteDate.getMonth() + 1)).slice(-2) + '-' + noteDate.getFullYear() + ' ' + ('0' + noteDate.getHours()).slice(-2) + ':' + ('0' + noteDate.getMinutes()).slice(-2);
                        noteHistoryHtml += '<p><strong>' + noteEntry.user + '</strong> (' + formattedDate + '):<br>' + noteEntry.note.replace(/\n/g, '<br>') + '</p>';
                    });
                    html += '<div class="tracking-accordion">';
                    html += '<button class="accordion"><span class="accordion-text">' + (latestNote.note || '') + '</span></button>';
                    html += '<div class="panel" style="display:none;">' + noteHistoryHtml + '</div>';
                    html += '</div>';
                }
                html += '</div>';
                html += '<span class="edit-note-button edit-cell-icon">' + otmIcon('pencil-alt', 'otm-icon') + '</span>';
                return html;
            case 'order_id':
                if (order.is_limited) {
                    html += order.id;
                } else {
                    html += '<a href="' + order.edit_link + '" target="_blank" class="com-order-id-link">' + order.id + '</a>';
                    html += '<button class="otm-duplicate-order-btn" data-order-id="' + order.id + '" title="Duplicate Order">' + otmIcon('copy') + '</button>';
                }
                return html;
            case 'products':
                html += '<div class="product-display">' + (order.product_list || order.products || '') + '</div>';
                html += '<div class="product-editor" style="display:none;">' +
                    '<input type="text" class="product-search-input" placeholder="Search products...">' +
                    '<div class="product-suggestions" style="display:none;"></div>' +
                    '<div class="selected-products"></div>' +
                    '<button class="update-products-button" data-order-id="' + order.id + '">Update</button>' +
                    '<button type="button" class="cancel-edit-products-button">Cancel</button>' +
                    '</div>';
                html += '<span class="edit-products-button edit-cell-icon">' + otmIcon('pencil-alt', 'otm-icon') + '</span>';
                return html;
            case 'block':
                if (order.is_blocked) {
                    html += '<button class="unblock-button" data-order-id="' + order.id + '" data-phone1="' + (order.billing_phone || '') + '" data-email="' + (order.billing_email || '') + '">Unblock</button>';
                } else {
                    html += '<button class="block-button" data-order-id="' + order.id + '" data-phone1="' + (order.billing_phone || '') + '" data-email="' + (order.billing_email || '') + '">Block</button>';
                }
                html += '<div class="block-message"></div>';
                return html;
            case 'bulk_action':
                html += '<div class="flex-container"><input type="checkbox" class="order-checkbox margin-right-5" value="' + order.id + '">';
                html += '<select class="status-dropdown" data-order-id="' + order.id + '">';
                for (var tabSlug in WOTM_APP.otm_tabs) {
                    if (WOTM_APP.otm_tabs.hasOwnProperty(tabSlug)) {
                        if (tabSlug === 'all') continue;
                        var selected = order.current_status === tabSlug.replace('wc-', '') ? ' selected' : '';
                        html += '<option value="' + tabSlug + '"' + selected + '>' + WOTM_APP.otm_tabs[tabSlug] + '</option>';
                    }
                }
                html += '</select>';
                html += '<button class="update-status-button update-status-button-icon" data-order-id="' + order.id + '">' + otmIcon('save') + '</button></div>';
                html += '<div class="status-update-message"></div>';
                return html;
            case 'send_to_courier':
                html += '<div class="flex-container">';
                if (!order._otm_courier_consignment_id) {
                    html += '<button class="button otm-send-to-courier-btn" data-order-id="' + order.id + '">Send</button>';
                } else {
                    html += '<button class="button" disabled>Sent</button><button class="button otm-resend-courier-btn" data-order-id="' + order.id + '" style="margin-left: 5px;" title="Resend to Courier">' + otmIcon('redo') + '</button>';
                }
                html += '</div>';
                return html;
            case 'courier_status':
                var courierStatus = order.courier_status || '-';
                var hasCid = !!(order.consignment_id || order._otm_courier_consignment_id);
                if (courierStatus === '-' && !hasCid) {
                    html += '<span class="otm-courier-status-display">Not Sent</span>';
                } else {
                    var displayStatus = courierStatus === '-' ? 'N/A' : courierStatus;
                    html += '<div class="flex-container"><span class="otm-courier-status-display">' + displayStatus + '</span><button class="button otm-resync-status-btn" data-order-id="' + order.id + '" style="margin-left: 5px;" title="Sync Courier Status">' + otmIcon('sync-alt') + '</button></div>';
                }
                return html;
            case 'zone':
                var zoneVal = (order.zone != null && order.zone !== '' && order.zone !== '-') ? String(order.zone).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
                html += '<div class="zone-selector-container">';
                html += '<input type="text" class="zone-search-input" value="' + zoneVal + '" placeholder="Select Zone">';
                html += '<div class="zone-dropdown" style="display: none;"></div>';
                html += '</div>';
                return html;
            case 'courier_edit':
                if (order.courier_edit_url) {
                    html += '<a href="' + order.courier_edit_url + '" class="button" target="_blank">Edit</a>';
                } else {
                    html += '<button class="button" disabled>N/A</button>';
                }
                return html;
            case 'invoice':
                if (order.invoice != null && String(order.invoice).indexOf('button') !== -1) {
                    return order.invoice;
                }
                var printCountInv = order.print_count || 0;
                var invoiceBtnText = printCountInv > 0 ? ('Printed ' + printCountInv) : 'Print';
                var hasConsignmentInv = !!(order.consignment_id || order._otm_courier_consignment_id);
                html += '<button class="button otm-print-invoice-btn" data-order-id="' + order.id + '"' + (hasConsignmentInv ? '' : ' disabled') + '>' + invoiceBtnText + '</button>';
                return html;
            case 'courier_rate':
                if (order.courier_rate != null && String(order.courier_rate).indexOf('<') !== -1) {
                    return order.courier_rate;
                }
                return (order.courier_rate != null && order.courier_rate !== '') ? (order.courier_rate || '-') : '-';
            case 'first_touch_utm':
                return WOTM_APP.buildAttributionAccordionHtml(order.first_touch_utm);
            case 'last_touch_utm':
                return WOTM_APP.buildAttributionAccordionHtml(order.last_touch_utm);
            case 'courier_note':
                if (all_order_list_params.per_order_note_enabled) {
                    html += '<textarea class="otm-courier-note-textarea" rows="1" data-order-id="' + order.id + '">' + otmEscapeHtml(order.courier_note || '') + '</textarea>';
                } else if (all_order_list_params.common_note_enabled) {
                    html += '<textarea class="otm-courier-note-textarea" rows="1" data-order-id="' + order.id + '" title="A common note is active. Disable it in the admin dashboard to use this." disabled></textarea>';
                }
                return html;
            default:
                if (order[key] != null && order[key] !== '') {
                    return String(order[key]);
                }
                return '-';
        }
    };

    /**
     * Refresh an existing order row from server payload (after any AJAX mutation).
     */
    WOTM_APP.applyLiveOrderRowPatch = function(row, liveRow) {
        if (!row || !row.length || !liveRow || liveRow.id == null) return;
        var order = $.extend({}, liveRow);
        order.product_list = order.product_list != null ? order.product_list : order.products;
        order.note_history = order.note_history || [];
        order.assignee_id = order.assignee_id != null ? order.assignee_id : 0;
        if (!order.current_status_slug && order.current_status) {
            order.current_status_slug = 'wc-' + order.current_status;
        }
        order.is_limited = !!(typeof all_order_list_params !== 'undefined' && all_order_list_params.is_limited);

        row.toggleClass('duplicate-phone', !!order.is_duplicate_phone);

        var visibleKeys = WOTM_APP.getVisibleColumnKeys();
        visibleKeys.forEach(function(colKey) {
            if (!otm_column_data[colKey]) return;
            var td = row.children('td.otm-column-' + colKey);
            if (!td.length) return;
            if (colKey === 'sl') return;

            var is_editable = !WOTM_NON_EDITABLE_ORDER_COLUMNS.includes(colKey);

            if (colKey === 'status') {
                var cls = (td.attr('class') || '').replace(/\bstatus-[\w-]+\b/g, '').replace(/\s+/g, ' ').trim();
                td.attr('class', cls);
                td.addClass('status-' + order.current_status_slug);
            }

            td.html(WOTM_APP.buildOrderCellInnerHtml(colKey, order, is_editable, null));

            if (is_editable) {
                td.addClass('editable-cell');
                td.attr('data-key', colKey);
            } else {
                td.removeClass('editable-cell');
                td.removeAttr('data-key');
            }
            if (colKey === 'products') {
                td.addClass('product-cell');
            } else {
                td.removeClass('product-cell');
            }
        });

        WOTM_APP.initAccordions();
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                if (typeof WOTM_APP.updateOrdersTableScrollWidth === 'function') {
                    WOTM_APP.updateOrdersTableScrollWidth();
                }
            });
        });
    };
    
    WOTM_APP.displaySearchResults = function(orders, term) {
        if (orders.length === 0) {
            $('#orders-table-container').html('<p>No orders found for: "' + term + '"</p>');
            return;
        }

        var statusMap = {}; // maps clean slug to label
        var statusCounts = {}; // counts using clean slug
        
        for (var status_key in WOTM_APP.otm_tabs) {
            if (WOTM_APP.otm_tabs.hasOwnProperty(status_key) && status_key !== 'all') {
                var clean_key = status_key.replace(/^wc-/, '');
                statusMap[clean_key] = WOTM_APP.otm_tabs[status_key];
                statusCounts[clean_key] = 0;
            }
        }
        
        orders.forEach(function(order) {
            if (statusCounts.hasOwnProperty(order.current_status)) {
                statusCounts[order.current_status]++;
            }
        });
        
        var html = '<div class="search-results-message">Showing search results for: "' + term + '", All: ' + orders.length;
        
        for (var clean_key in statusCounts) {
            if (statusCounts.hasOwnProperty(clean_key)) {
                html += ', ' + statusMap[clean_key] + ': ' + statusCounts[clean_key];
            }
        }
        
        html += '</div>';
        html += '<table class="com-table"><thead><tr>';
        var visibleKeys = WOTM_APP.getVisibleColumnKeys();
        var canAssignSearch = typeof all_order_list_params !== 'undefined' && !!all_order_list_params.can_assign;
        visibleKeys.forEach(function(key) {
            var column = otm_column_data[key];
            if (column) {
                var header_style = 'width:' + column.width + 'px;';
                html += '<th class="otm-column-' + key + '" style="' + header_style + '" data-key="' + key + '">';
                var colLabel = (column.label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                var tip = (typeof otm_column_tooltips !== 'undefined' && otm_column_tooltips[key]) ? String(otm_column_tooltips[key]).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
                var tipAttr = tip ? ' data-tooltip="' + tip + '"' : '';
                if (key === 'bulk_action') {
                    html += '<div class="flex-container"><input type="checkbox" id="select-all-orders" class="margin-right-5"><select id="bulk-status-dropdown" class="width-100"><option value="">' + colLabel + '</option>';
                    for (var status_key in WOTM_APP.otm_tabs) {
                        if (WOTM_APP.otm_tabs.hasOwnProperty(status_key)) {
                            if (status_key === 'all') continue;
                            html += '<option value="' + status_key + '">' + WOTM_APP.otm_tabs[status_key] + '</option>';
                        }
                    }
                    html += '</select><button id="bulk-update-status-button" class="update-status-button-icon">' + otmIcon('save') + '</button>';
                    html += '<span class="otm-th-info" role="button" tabindex="0" aria-label="Help"' + tipAttr + '>' + otmIcon('info-circle', 'otm-icon') + '</span></div>';
                } else {
                    if (key === 'assignee' && canAssignSearch) {
                        html += '<div class="flex-container" style="justify-content: center;">';
                        html += '<input type="checkbox" id="select-all-assignee" class="margin-right-5" title="Select all orders on this page">';
                        html += '<select id="bulk-assign-dropdown-header" class="width-100" style="flex-grow: 1;"><option value="">' + colLabel + '</option>';
                        (all_order_list_params.staff_users || []).forEach(function(staff) {
                            html += '<option value="' + staff.ID + '">' + String(staff.display_name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</option>';
                        });
                        html += '</select><button id="bulk-assign-button-header" class="update-status-button-icon" title="Assign selected orders">' + otmIcon('save') + '</button>';
                        html += '<span class="otm-th-info" role="button" tabindex="0" aria-label="Help"' + tipAttr + '>' + otmIcon('info-circle', 'otm-icon') + '</span></div>';
                    } else if (key === 'invoice') {
                        html += '<div class="flex-container"><select id="otm-bulk-print-mode" class="width-100"><option value="unprinted">Print Unprinted</option><option value="all">Reprint All</option></select><button id="otm-bulk-print-invoices" class="update-status-button-icon" title="Bulk print invoices">' + otmIcon('print') + '</button><span class="otm-th-info" role="button" tabindex="0" aria-label="Help"' + tipAttr + '>' + otmIcon('info-circle', 'otm-icon') + '</span></div>';
                    } else {
                        html += '<span class="otm-th-text">' + colLabel + '</span>';
                        if (key === 'order_id' || key === 'order_date') {
                            var sortIconClass = 'sort-icon';
                            if (WOTM_APP.sortBy === key) {
                                sortIconClass += ' active-sort-' + WOTM_APP.sortOrder.toLowerCase();
                            }
                            html += '<span class="' + sortIconClass + '" data-sort-key="' + key + '">' +
                                        otmIcon('sort-up') +
                                        otmIcon('sort-down') +
                                    '</span>';
                        }
                    }
                    if (!(key === 'assignee' && canAssignSearch) && key !== 'invoice') {
                        if (key === 'send_to_courier') {
                            html += '<button id="otm-bulk-send-to-courier" class="button button-small" title="Send All to Courier">' + otmIcon('paper-plane') + '</button>';
                        }
                        if (key === 'courier_status') {
                            html += '<button id="otm-bulk-sync-courier-status" class="button button-small" title="Sync All Statuses">' + otmIcon('sync-alt') + '</button>';
                        }
                        html += '<span class="otm-th-info" role="button" tabindex="0" aria-label="Help"' + tipAttr + '>' + otmIcon('info-circle', 'otm-icon') + '</span>';
                    }
                }
                html += '<div class="resizer"></div></th>';
            }
        });
        html += '</tr></thead><tbody>';
        
        orders.forEach(function(order, index) {
            var row_class = order.is_duplicate_phone ? 'duplicate-phone' : '';
            html += '<tr class="com-row ' + row_class + '" data-order-id="' + order.id + '">';

            visibleKeys.forEach(function(key) {
                var column = otm_column_data[key];
                if (column) {
                    var is_editable = !WOTM_NON_EDITABLE_ORDER_COLUMNS.includes(key);

                    var td_classes = 'otm-column-' + key;
                    if (is_editable) {
                        td_classes += ' editable-cell';
                    }
                    if (key === 'products') {
                        td_classes += ' product-cell';
                    }
                    if (key === 'status') {
                        td_classes += ' status-' + order.current_status_slug;
                    }
                    var data_key_attr = is_editable ? 'data-key="' + key + '"' : '';

                    html += '<td class="' + td_classes + '" ' + data_key_attr + '>';
                    html += WOTM_APP.buildOrderCellInnerHtml(key, order, is_editable, index);
                    html += '</td>';
                }
            });
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        $('#orders-table-container').html(html);
        WOTM_APP.initAccordions();
        if (WOTM_APP.currentTab === 'wc-otm-zone-chan' && typeof window.WOTM_ZoneMatch !== 'undefined') {
            window.WOTM_ZoneMatch.scheduleComputeFromLastParams();
        }
        _runAfterLayout(WOTM_APP.updateOrdersTableScrollWidth);
    }

    var _runAfterLayout = function(fn) {
        requestAnimationFrame(function() { requestAnimationFrame(fn); });
    };

    // Update tab button labels with new counts (desktop buttons + mobile dropdown)
    WOTM_APP.applyTabCountsToButtons = function(counts) {
        // Update otm_tabs labels and re-render tab buttons
        for (var slug in counts) {
            if (counts.hasOwnProperty(slug)) {
                var base = WOTM_APP.tabBaseLabels[slug];
                if (typeof base !== 'undefined') {
                    WOTM_APP.otm_tabs[slug] = base + ' (' + counts[slug] + ')';
                }
            }
        }
        // Desktop: update existing tab buttons text
        $('.tab-btn').each(function() {
            var tab = $(this).data('tab');
            if (typeof WOTM_APP.otm_tabs[tab] !== 'undefined') {
                $(this).text(WOTM_APP.otm_tabs[tab]);
            }
        });
        // Mobile dropdown: update option text
        $('#tab-dropdown option').each(function() {
            var tab = $(this).val();
            if (typeof WOTM_APP.otm_tabs[tab] !== 'undefined') {
                $(this).text(WOTM_APP.otm_tabs[tab]);
            }
        });
    };

    // Fetch filtered tab counts from server and update tab labels
    WOTM_APP.fetchAndUpdateTabCounts = function() {
        var productId = $('#product-filter-id').val();
        var productName = $('#product-filter').val();
        var filters = {
            date_from: $('#date-range-from').val(),
            date_to: $('#date-range-to').val(),
            order_from: $('#order-range-from').val(),
            order_to: $('#order-range-to').val(),
            product: productId ? productId : productName,
            category: $('#category-filter').val(),
            assignee: $('#assignee-filter').val(),
            zone: $('#filter-zone-value').val() || ''
        };
        var postData = {
            action: 'otm_get_filtered_tab_counts',
            security: WOTM_APP.ajaxNonce,
            filters: filters,
            is_profit_loss_mode: WOTM_APP.isProfitLossMode ? '1' : '0',
            search: WOTM_APP.searchTerm
        };
        if (WOTM_APP.isProfitLossMode && WOTM_APP.onlyMissingPlView) {
            postData.only_missing_pl = '1';
        }
        $.post(all_order_list_params.ajax_url, postData, function(response) {
            if (response.success) {
                WOTM_APP.updateNonce(response.data.new_nonce);
                WOTM_APP.applyTabCountsToButtons(response.data.tab_counts);
            }
        });
    };

    // Initialize accordions
    WOTM_APP.initAccordions = function() {
        $('.accordion').off('click').on('click', function() {
            $(this).toggleClass('active');
            $(this).next('.panel').toggle();
        });
    }

    // Ensure horizontal scrollbar is consistent: set table min-width to sum of column widths
    WOTM_APP.updateOrdersTableScrollWidth = function() {
        var $table = $('#orders-table-container').find('table.com-table').not('.com-table-abandoned').first();
        if (!$table.length) return;
        var total = 0;
        $table.find('thead th').each(function() {
            total += $(this).outerWidth();
        });
        if (total > 0) {
            $table[0].style.minWidth = total + 'px';
        }
    };

    WOTM_APP.handleTabsResponsive = function() {
        var tabContainer = $('.tab-buttons');
        if (window.innerWidth < 768) {
            if ($('#tab-dropdown').length === 0) {
                var dropdown = '<select id="tab-dropdown" class="tab-dropdown"><option>Select Tab</option>';
                if (WOTM_APP.isProfitLossMode) {
                    // P/L mode: only show P/L tabs in dropdown
                    WOTM_APP.plStatuses.forEach(function(status) {
                        var label = WOTM_APP.plStatusLabels[status] || status;
                        var cnt = WOTM_APP.plTabCounts && WOTM_APP.plTabCounts[status] !== undefined
                            ? ' (' + WOTM_APP.plTabCounts[status] + ')' : '';
                        var selected = (status === WOTM_APP.currentTab) ? ' selected' : '';
                        dropdown += '<option value="' + status + '"' + selected + '>' + label + cnt + '</option>';
                    });
                } else {
                    for (var key in WOTM_APP.otm_tabs) {
                        if (WOTM_APP.otm_tabs.hasOwnProperty(key)) {
                            var selected = (key === WOTM_APP.currentTab) ? ' selected' : '';
                            dropdown += '<option value="' + key + '"' + selected + '>' + WOTM_APP.otm_tabs[key] + '</option>';
                        }
                    }
                }
                dropdown += '</select>';
                tabContainer.html(dropdown);
            }
        } else {
            if ($('#tab-dropdown').length > 0) {
                // Rebuild buttons from otm_tabs, then re-apply P/L filter if needed
                var tabButtonsHtml = '';
                for (var key in WOTM_APP.otm_tabs) {
                    if (WOTM_APP.otm_tabs.hasOwnProperty(key)) {
                        tabButtonsHtml += '<button class="tab-btn" data-tab="' + key + '">' + WOTM_APP.otm_tabs[key] + '</button>';
                    }
                }
                tabContainer.html(tabButtonsHtml);
                if (WOTM_APP.isProfitLossMode) {
                    WOTM_APP.applyPlTabFilter();
                } else {
                    $('.tab-btn').removeClass('active');
                    var $activeTab = $('.tab-btn[data-tab="' + WOTM_APP.currentTab + '"]');
                    if ($activeTab.length) {
                        $activeTab.addClass('active');
                    } else {
                        var $firstBtn = $('.tab-btn').first();
                        if ($firstBtn.length) {
                            WOTM_APP.currentTab = $firstBtn.data('tab');
                            $firstBtn.addClass('active');
                        }
                    }
                }
            }
        }
    };
    
    // Load initial tabs and orders
    WOTM_APP.loadTabsAndOrders();
    WOTM_APP.loadCategories();

    // Order credits low warning: allow dismissing the notice
    (function initOrderCreditsNotice() {
        var $notice = $('.otm-order-credits-notice');
        if (!$notice.length) return;
        $notice.off('click', '.otm-order-credits-notice-dismiss').on('click', '.otm-order-credits-notice-dismiss', function() {
            $(this).closest('.otm-order-credits-notice').hide();
        });
    })();

    // SMS balance low warning: allow dismissing the notice (same behaviour as order credits)
    (function initSmsBalanceNotice() {
        var $notice = $('.otm-sms-balance-notice');
        if (!$notice.length) return;
        $notice.off('click', '.otm-sms-balance-notice-dismiss').on('click', '.otm-sms-balance-notice-dismiss', function() {
            $(this).closest('.otm-sms-balance-notice').hide();
        });
    })();

    // Server notice: allow dismissing (same as other notices)
    (function initServerNotice() {
        var $notice = $('.otm-server-notice');
        if (!$notice.length) return;
        $notice.off('click', '.otm-server-notice-dismiss').on('click', '.otm-server-notice-dismiss', function() {
            $(this).closest('.otm-server-notice').hide();
        });
    })();

    // Call subscription notice: allow dismissing (same as other notices)
    (function initCallSubscriptionNotice() {
        var $notice = $('.otm-call-subscription-notice');
        if (!$notice.length) return;
        $notice.off('click', '.otm-call-subscription-notice-dismiss').on('click', '.otm-call-subscription-notice-dismiss', function() {
            $(this).closest('.otm-call-subscription-notice').hide();
        });
    })();

})(jQuery);