(function($) {
    'use strict';

    if (typeof wotm_inventory_params === 'undefined') return;

    var params = wotm_inventory_params;
    var currentTab = 'all';
    var currentPage = 1;
    var perPage = 25;
    var searchTerm = '';
    var categoryId = 0;
    var productId = 0;
    var searchTimer = null;
    var productFilterTimer = null;
    var tooltipHideTimer = null;
    var tooltipShowTimer = null;

    function escapeAttr(str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    }

    function buildTotalValueCardHtml(amountStr) {
        var label = params.label_total_inventory_value || 'Total inventory value';
        var tip = params.tooltip_total_inventory_value || '';
        var tipAttr = tip ? ' data-tooltip="' + escapeAttr(tip) + '"' : '';
        return '<span class="otm-inventory-total-value-label-wrap">' +
            '<span class="otm-inventory-total-value-label">' + escapeHtml(label) + '</span>' +
            (tip ? '<span class="otm-inventory-card-info" role="button" tabindex="0" aria-label="Help"' + tipAttr + '">' + otmIcon('info-circle', 'otm-icon') + '</span>' : '') +
            '</span><span class="otm-inventory-total-value-amount">' + (params.currency_symbol || '') + amountStr + '</span>';
    }

    function showToast(message) {
        if (typeof WOTM_APP !== 'undefined' && typeof WOTM_APP.showToast === 'function') {
            WOTM_APP.showToast(message);
            return;
        }
        var $toast = $('#otm-toast');
        if (!$toast.length) return;
        $toast.text(message).addClass('show');
        clearTimeout($toast.data('toast-timer'));
        $toast.data('toast-timer', setTimeout(function() {
            $toast.removeClass('show');
        }, 3000));
    }

    function loadSummary() {
        $.post(params.ajax_url, {
            action: 'wotm_inventory_summary',
            nonce: params.nonce
        }).done(function(res) {
            if (!res.success || !res.data) return;
            var d = res.data;
            var notTracked = typeof d.not_tracked !== 'undefined' ? d.not_tracked : 0;
            var tabHtml = '';
            tabHtml += '<button type="button" class="tab-btn active" data-tab="all">All (' + d.total + ')</button>';
            tabHtml += '<button type="button" class="tab-btn" data-tab="in_stock">In Stock (' + d.in_stock + ')</button>';
            tabHtml += '<button type="button" class="tab-btn" data-tab="low_stock">Low Stock (<span class="otm-inventory-tab-count-low-stock">' + d.low_stock + '</span>)</button>';
            tabHtml += '<button type="button" class="tab-btn" data-tab="out_of_stock">Out of Stock (' + d.out_of_stock + ')</button>';
            tabHtml += '<button type="button" class="tab-btn" data-tab="not_tracked">Stock Disabled (' + notTracked + ')</button>';
            $('#otm-inventory-tab-buttons').html(tabHtml);
            $('#otm-inventory-tab-buttons .tab-btn').removeClass('active');
            $('#otm-inventory-tab-buttons .tab-btn[data-tab="' + currentTab + '"]').addClass('active');

            var tv = typeof d.total_inventory_value !== 'undefined' ? parseFloat(d.total_inventory_value) : 0;
            var tvStr = (tv === Math.floor(tv) ? String(Math.floor(tv)) : tv.toFixed(2).replace(/\.?0+$/, ''));
            $('#otm-inventory-total-value-card').html(buildTotalValueCardHtml(tvStr));
        });
    }

    function loadList() {
        var $container = $('#otm-inventory-table-container');
        var loadingText = (params.loading_text || 'Loading inventory…');
        $container.html('<div class="loading-indicator">' + loadingText + '</div>');

        $.post(params.ajax_url, {
            action: 'wotm_inventory_list',
            nonce: params.nonce,
            tab: currentTab,
            page: currentPage,
            per_page: perPage,
            search: searchTerm,
            category_id: categoryId,
            product_id: productId
        }).done(function(res) {
            if (!res.success || !res.data) {
                $container.html('<p>Unable to load list.</p>');
                return;
            }
            $container.html(res.data.html);
            initInventoryAccordions();
            updateBulkBarVisibility();
            requestAnimationFrame(function() {
                requestAnimationFrame(updateInventoryTableScrollWidth);
            });
        }).fail(function() {
            $container.html('<p>Unable to load list.</p>');
        });
    }

    function updateInventoryTableScrollWidth() {
        var $table = $('#otm-inventory-table-container').find('table.wotm-inventory-table').first();
        if (!$table.length) return;
        var total = 0;
        $table.find('thead th').each(function() {
            total += $(this).outerWidth();
        });
        if (total > 0) {
            $table[0].style.minWidth = total + 'px';
        }
    }

    function initInventoryAccordions() {
        $('#otm-inventory-table-container .accordion').off('click').on('click', function() {
            $(this).toggleClass('active');
            $(this).next('.panel').toggle();
        });
    }

    function getSelectedProductIds() {
        var ids = [];
        $('#otm-inventory-table-container .otm-inventory-row-checkbox:checked').each(function() {
            var id = $(this).val();
            if (id) ids.push(id);
        });
        return ids;
    }

    function updateBulkBarVisibility() {
        var ids = getSelectedProductIds();
        var $bar = $('#otm-inventory-bulk-bar');
        var $placeholder = $('#otm-inventory-bulk-placeholder');
        var $count = $('#otm-inventory-bulk-selected-count');
        if (ids.length > 0) {
            $count.text(ids.length);
            $placeholder.hide();
            $bar.css('display', 'flex');
        } else {
            $placeholder.show();
            $bar.hide();
        }
    }

    function loadCategories() {
        $.post(params.ajax_url, { action: 'wotm_inventory_get_categories', nonce: params.nonce })
            .done(function(res) {
                if (res.success && res.data && res.data.categories) {
                    var $sel = $('#otm-inventory-category-filter');
                    $sel.find('option:not(:first)').remove();
                    res.data.categories.forEach(function(c) {
                        $sel.append($('<option></option>').val(c.id).text(c.text));
                    });
                }
            });
    }

    function showTooltipPopover($trigger, text) {
        var $pop = $('#otm-inventory-tooltip-popover');
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

    function hideTooltipPopover() {
        var $pop = $('#otm-inventory-tooltip-popover');
        $pop.removeClass('is-visible is-pinned').attr('aria-hidden', 'true').text('');
    }

    $(document).ready(function() {
        loadSummary();
        loadCategories();
        loadList();

        $(document).on('mouseenter', '.otm-inventory-th-info, .otm-inventory-card-info', function() {
            var $el = $(this);
            clearTimeout(tooltipHideTimer);
            tooltipShowTimer = setTimeout(function() {
                var text = $el.attr('data-tooltip');
                if (text) showTooltipPopover($el, text);
            }, 400);
        });
        $(document).on('mouseleave', '.otm-inventory-th-info, .otm-inventory-card-info', function() {
            clearTimeout(tooltipShowTimer);
            tooltipHideTimer = setTimeout(hideTooltipPopover, 150);
        });
        $(document).on('click', '.otm-inventory-th-info, .otm-inventory-card-info', function(e) {
            e.preventDefault();
            clearTimeout(tooltipShowTimer);
            clearTimeout(tooltipHideTimer);
            var $el = $(this);
            var text = $el.attr('data-tooltip');
            var $pop = $('#otm-inventory-tooltip-popover');
            if (text && $pop.length) {
                if ($pop.hasClass('is-visible') && $pop.text() === text) {
                    hideTooltipPopover();
                    return;
                }
                showTooltipPopover($el, text);
                $pop.addClass('is-pinned');
                $(document).one('click', function(ev) {
                    if (!$(ev.target).closest('.otm-inventory-th-info, .otm-inventory-card-info, #otm-inventory-tooltip-popover').length) {
                        hideTooltipPopover();
                    }
                });
            }
        });
        $(document).on('keydown', '.otm-inventory-th-info, .otm-inventory-card-info', function(e) {
            if (e.key === 'Escape') hideTooltipPopover();
        });

        $(document).on('click', '#otm-inventory-tab-buttons .tab-btn', function() {
            currentTab = $(this).data('tab');
            currentPage = 1;
            $('#otm-inventory-tab-buttons .tab-btn').removeClass('active');
            $(this).addClass('active');
            loadList();
        });

        $(document).on('click', '#otm-inventory-table-container .page-button[data-page]', function() {
            var p = $(this).data('page');
            if (p && p >= 1) {
                currentPage = parseInt(p, 10);
                loadList();
            }
        });

        // Category dropdown: change auto-filters table (no Apply button)
        $('#otm-inventory-category-filter').on('change', function() {
            categoryId = $(this).val() ? parseInt($(this).val(), 10) : 0;
            productId = 0;
            $('#otm-inventory-search').val('');
            $('#otm-inventory-search-product-id').val('');
            searchTerm = '';
            currentPage = 1;
            $('#otm-inventory-search-suggestions').hide().empty();
            loadList();
            loadSummary();
        });

        // Search box: typing only shows AJAX suggestions; table updates only when user selects from dropdown
        $('#otm-inventory-search').on('input', function() {
            var term = $(this).val().trim();
            var suggestionsDiv = $('#otm-inventory-search-suggestions');
            if (term.length === 0) {
                $('#otm-inventory-search-product-id').val('');
                productId = 0;
                searchTerm = '';
                suggestionsDiv.hide().empty();
                loadList();
                return;
            }
            clearTimeout(productFilterTimer);
            if (term.length < 2) {
                suggestionsDiv.hide().empty();
                return;
            }
            productFilterTimer = setTimeout(function() {
                $.post(params.ajax_url, {
                    action: 'wotm_inventory_search_products',
                    nonce: params.nonce,
                    term: term,
                    category_id: categoryId
                }).done(function(res) {
                    if (res.success && res.data && res.data.products) {
                        var html = '<ul>';
                        res.data.products.forEach(function(p) {
                            html += '<li data-product-id="' + parseInt(p.id, 10) + '">' + (p.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</li>';
                        });
                        html += '</ul>';
                        suggestionsDiv.html(html).show();
                    } else {
                        suggestionsDiv.hide().empty();
                    }
                }).fail(function() {
                    suggestionsDiv.hide().empty();
                });
            }, 300);
        });
        $(document).on('click', '#otm-inventory-search-suggestions li', function(e) {
            e.stopPropagation();
            var pid = $(this).data('product-id');
            var productText = $(this).text();
            $('#otm-inventory-search').val(productText);
            $('#otm-inventory-search-product-id').val(pid);
            productId = parseInt(pid, 10);
            searchTerm = '';
            $('#otm-inventory-search-suggestions').hide().empty();
            currentPage = 1;
            loadList();
        });
        $(document).on('click', function(e) {
            if (!$(e.target).closest('#otm-inventory-search').length && !$(e.target).closest('#otm-inventory-search-suggestions').length) {
                $('#otm-inventory-search-suggestions').hide().empty();
            }
            if (!$(e.target).closest('.otm-inventory-bulk-actions-wrap').length) {
                closeBulkModal();
            }
        });

        function closeBulkModal() {
            $('#otm-inventory-bulk-modal').hide().attr('aria-hidden', 'true');
        }
        function openBulkModal() {
            $('#otm-inventory-bulk-modal').show().attr('aria-hidden', 'false');
        }

        function positionDropdownInViewport(buttonId, dropdownId) {
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
            dropdown.style.right = 'auto';
        }

        $('#otm-inventory-bulk-actions-btn').on('click', function(e) {
            e.stopPropagation();
            $('#otm-inventory-bulk-modal').toggle();
            var isVisible = $('#otm-inventory-bulk-modal').is(':visible');
            $('#otm-inventory-bulk-modal').attr('aria-hidden', isVisible ? 'false' : 'true');
            if (isVisible) {
                requestAnimationFrame(function() {
                    positionDropdownInViewport('otm-inventory-bulk-actions-btn', 'otm-inventory-bulk-modal');
                });
            }
        });

        $(document).on('click', '.otm-inventory-goto-low-stock-tab', function(e) {
            e.preventDefault();
            currentTab = 'low_stock';
            currentPage = 1;
            $('#otm-inventory-tab-buttons .tab-btn').removeClass('active');
            $('#otm-inventory-tab-buttons .tab-btn[data-tab="low_stock"]').addClass('active');
            loadList();
        });

        $(document).on('click', '.otm-inventory-low-stock-notice-dismiss', function() {
            $('.otm-inventory-low-stock-notice').hide();
        });

        // Select all / row checkboxes -> bulk bar
        $(document).on('change', '#otm-inventory-table-container #otm-inventory-select-all', function() {
            var checked = $(this).prop('checked');
            $('#otm-inventory-table-container .otm-inventory-row-checkbox').prop('checked', checked);
            $('#otm-inventory-table-container .com-table tbody tr').toggleClass('selected', checked);
            updateBulkBarVisibility();
        });
        $(document).on('change', '#otm-inventory-table-container .otm-inventory-row-checkbox', function() {
            $(this).closest('tr').toggleClass('selected', $(this).prop('checked'));
            updateBulkBarVisibility();
        });

        // Row click to select (same as order manager): toggle checkbox and selected class
        $(document).on('click', '#otm-inventory-table-container .com-table tbody tr', function(e) {
            if ($(e.target).is('input, a, button, select, textarea') || $(e.target).closest('.edit-cell-icon, .cell-data-input, .product-editor, .accordion, .panel').length) {
                return;
            }
            var cb = $(this).find('.otm-inventory-row-checkbox');
            var isChecked = !cb.prop('checked');
            cb.prop('checked', isChecked);
            $(this).toggleClass('selected', isChecked);
            updateBulkBarVisibility();
        });

        $('#otm-inventory-bulk-clear-selection').on('click', function() {
            $('#otm-inventory-table-container .otm-inventory-row-checkbox').prop('checked', false);
            $('#otm-inventory-table-container #otm-inventory-select-all').prop('checked', false);
            $('#otm-inventory-table-container .com-table tbody tr').removeClass('selected');
            updateBulkBarVisibility();
        });

        // Inline edit: pen icon -> input; save on Enter or blur
        $(document).on('click', '#otm-inventory-table-container .edit-cell-icon', function(e) {
            e.stopPropagation();
            var td = $(this).closest('td[data-key]');
            if (!td.length) td = $(this).closest('td');
            var dataSpan = td.find('.cell-data');
            var key = td.data('key');
            var valueToEdit;
            if (key === 'price') {
                valueToEdit = td.data('price-value') || td.find('.cell-data').text().replace(params.currency_symbol || '', '').trim();
            } else if (key === 'sale_price') {
                valueToEdit = td.data('sale-price-value') || td.find('.cell-data').text().replace(params.currency_symbol || '', '').trim();
            } else if (key === 'production_cost') {
                valueToEdit = td.data('production-cost-value') || td.find('.cell-data').text().replace(params.currency_symbol || '', '').trim();
            } else if (key === 'production_cost_on_return') {
                valueToEdit = td.data('loss-on-return-value') || td.find('.cell-data').text().replace(params.currency_symbol || '', '').trim();
            } else if (key === 'low_stock_amount') {
                valueToEdit = td.data('low-stock-amount-value');
                if (valueToEdit === undefined || valueToEdit === '') valueToEdit = dataSpan.text().trim();
            } else {
                valueToEdit = dataSpan.text().trim();
            }
            valueToEdit = valueToEdit == null ? '' : String(valueToEdit).trim();
            if (valueToEdit === '—' || valueToEdit === '\u2014' || valueToEdit === '\u2212') valueToEdit = '';
            if (td.find('.cell-data-input').length) return;
            td.find('.cell-data').hide();
            td.find('.edit-cell-icon').hide();
            var escaped = String(valueToEdit).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            var inputHtml = '<input type="text" class="cell-data-input" value="' + escaped + '">';
            td.append(inputHtml);
            var input = td.find('.cell-data-input');
            input.focus();
        });

        function getCellAndKey(input) {
            var td = input.closest('td[data-key]');
            if (!td.length) td = input.closest('tr').find('td[data-key]').first();
            var cell = td.hasClass('editable-cell') ? td : td.find('.editable-cell').first();
            if (!cell.length) cell = td;
            return { cell: cell, td: td, key: td.data('key') };
        }

        var inventorySavingViaEnter = false;

        function saveInventoryField(input) {
            var row = input.closest('tr');
            var productId = row.data('product-id');
            var ctx = getCellAndKey(input);
            var key = ctx.key;
            var newValue = (input.val() || '').trim();
            var dataSpan = ctx.cell.find('.cell-data');
            var icon = ctx.cell.find('.edit-cell-icon');
            if (!dataSpan.length) dataSpan = ctx.td.find('.cell-data');
            if (!icon.length) icon = ctx.td.find('.edit-cell-icon');
            if (!productId || !key) {
                dataSpan.show();
                icon.show();
                input.remove();
                return;
            }
            $.post(params.ajax_url, {
                action: 'wotm_inventory_update_field',
                nonce: params.nonce,
                product_id: productId,
                field: key,
                value: newValue
            }).done(function(res) {
                if (res.success && res.data) {
                    var targetRow = $('#otm-inventory-table-container tr[data-product-id="' + productId + '"]').first();
                    if (res.data.display !== undefined) {
                        dataSpan.html(res.data.display);
                        if (key === 'price' && res.data.price_value !== undefined) {
                            ctx.td.attr('data-price-value', res.data.price_value);
                        }
                        if (key === 'sale_price' && res.data.sale_price_value !== undefined) {
                            ctx.td.attr('data-sale-price-value', res.data.sale_price_value);
                        }
                        if (key === 'production_cost' && res.data.production_cost_value !== undefined) {
                            ctx.td.attr('data-production-cost-value', res.data.production_cost_value);
                        }
                        if (key === 'production_cost_on_return' && res.data.production_cost_on_return_value !== undefined) {
                            ctx.td.attr('data-loss-on-return-value', res.data.production_cost_on_return_value);
                        }
                        if (key === 'low_stock_amount' && res.data.low_stock_amount_value !== undefined) {
                            ctx.td.attr('data-low-stock-amount-value', res.data.low_stock_amount_value);
                        }
                    }
                    if (res.data.status_display !== undefined && targetRow.length) {
                        targetRow.find('.otm-inventory-cell-status').text(res.data.status_display);
                    }
                    if (res.data.value_display !== undefined && targetRow.length) {
                        targetRow.find('.otm-inventory-cell-value').html(res.data.value_display);
                    }
                    if (res.data.last_modified_html !== undefined && targetRow.length) {
                        targetRow.find('.otm-inventory-cell-last-modified').html(res.data.last_modified_html);
                    }
                    if (res.data.stock_history_html !== undefined && targetRow.length) {
                        targetRow.find('.otm-inventory-cell-stock-history').html(res.data.stock_history_html);
                    }
                    if (res.data.last_modified_html !== undefined || res.data.stock_history_html !== undefined) {
                        initInventoryAccordions();
                    }
                    if (res.data.total_inventory_value !== undefined) {
                        var tv = parseFloat(res.data.total_inventory_value) || 0;
                        var tvStr = (tv === Math.floor(tv) ? String(Math.floor(tv)) : tv.toFixed(2).replace(/\.?0+$/, ''));
                        $('#otm-inventory-total-value-card').html(buildTotalValueCardHtml(tvStr));
                    }
                    dataSpan.show();
                    icon.show();
                    input.remove();
                    if (targetRow.length) {
                        targetRow.addClass('otm-row-highlight');
                        setTimeout(function() { targetRow.removeClass('otm-row-highlight'); }, 1500);
                    }
                    showToast('Update successful!');
                    if (key === 'stock' || key === 'production_cost' || key === 'low_stock_amount') {
                        loadSummary();
                    }
                } else {
                    showToast(params.update_failed || 'Update failed. Please try again.');
                    dataSpan.show();
                    icon.show();
                    input.remove();
                }
            }).fail(function() {
                showToast(params.update_failed || 'Update failed. Please try again.');
                dataSpan.show();
                icon.show();
                input.remove();
            });
        }

        $(document).on('keydown', '#otm-inventory-table-container .cell-data-input', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                inventorySavingViaEnter = true;
                saveInventoryField($(this));
                setTimeout(function() { inventorySavingViaEnter = false; }, 0);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                var input = $(this);
                var td = input.closest('td[data-key]');
                if (!td.length) td = input.closest('td');
                var dataSpan = td.find('.cell-data');
                var icon = td.find('.edit-cell-icon');
                dataSpan.show();
                icon.show();
                input.remove();
            }
        });

        $(document).on('blur', '#otm-inventory-table-container .cell-data-input', function() {
            if (inventorySavingViaEnter) {
                $(this).remove();
                return;
            }
            var input = $(this);
            var ctx = getCellAndKey(input);
            if (ctx.cell && ctx.cell.length) {
                ctx.cell.find('.cell-data').show();
                ctx.cell.find('.edit-cell-icon').show();
            }
            if (ctx.td && ctx.td.length && ctx.td[0] !== ctx.cell[0]) {
                ctx.td.find('.cell-data').show();
                ctx.td.find('.edit-cell-icon').show();
            }
            input.remove();
        });

        // Enable stock button
        $(document).on('click', '#otm-inventory-table-container .otm-inventory-enable-stock', function() {
            var btn = $(this);
            var row = btn.closest('tr');
            var productId = row.data('product-id');
            if (!productId) return;
            var promptText = params.enable_stock_prompt || "Enter current stock amount:\n\n(Please ensure you update this regularly. If stock reaches 0, customers will not be able to place orders.)";
            var initialStock = prompt(promptText, "100");
            if (initialStock === null) {
                return;
            }
            initialStock = parseInt(initialStock, 10);
            if (isNaN(initialStock) || initialStock < 0) {
                 showToast(params.enter_positive || "Please enter a positive number.");
                 return;
            }
            btn.prop('disabled', true).text('…');
            $.post(params.ajax_url, {
                action: 'wotm_inventory_enable_stock',
                nonce: params.nonce,
                product_id: productId,
                initial_stock: initialStock
            }).done(function(res) {
                if (res.success) {
                    loadList();
                    loadSummary();
                    showToast(params.stock_enabled || 'Stock tracking enabled.');
                } else {
                    btn.prop('disabled', false).text(params.enable_stock_label || 'Enable stock tracking');
                    showToast(params.update_failed || 'Update failed. Please try again.');
                }
            }).fail(function() {
                btn.prop('disabled', false).text(params.enable_stock_label || 'Enable stock tracking');
                showToast(params.update_failed || 'Update failed. Please try again.');
            });
        });

        // Bulk stock: set / increase / decrease
        function doBulkStock(type) {
            var ids = getSelectedProductIds();
            if (ids.length === 0) {
                showToast(params.bulk_select_first || 'Please select one or more rows.');
                return;
            }
            var value = 0;
            if (type === 'set') value = parseInt($('#otm-inventory-bulk-set-value').val(), 10) || 0;
            else if (type === 'increase') value = parseInt($('#otm-inventory-bulk-increase-value').val(), 10) || 0;
            else value = parseInt($('#otm-inventory-bulk-decrease-value').val(), 10) || 0;
            if (type !== 'set' && value <= 0) {
                showToast(params.enter_positive || 'Please enter a positive number.');
                return;
            }
            $.post(params.ajax_url, {
                action: 'wotm_inventory_bulk_stock',
                nonce: params.nonce,
                product_ids: ids,
                type: type,
                value: value
            }).done(function(res) {
                if (res.success) {
                    closeBulkModal();
                    loadList();
                    loadSummary();
                    $('#otm-inventory-table-container .otm-inventory-row-checkbox').prop('checked', false);
                    $('#otm-inventory-table-container #otm-inventory-select-all').prop('checked', false);
                    updateBulkBarVisibility();
                    showToast(params.bulk_done || 'Stock updated successfully.');
                } else {
                    showToast((res.data && res.data.message) ? res.data.message : (params.update_failed || 'Update failed.'));
                }
            }).fail(function() {
                showToast(params.update_failed || 'Update failed. Please try again.');
            });
        }
        $('#otm-inventory-bulk-stock-apply-btn').on('click', function() {
            var setInput = $('#otm-inventory-bulk-set-value');
            var incVal = parseInt($('#otm-inventory-bulk-increase-value').val(), 10) || 0;
            var decVal = parseInt($('#otm-inventory-bulk-decrease-value').val(), 10) || 0;
            if (setInput.val() !== '' && !isNaN(parseInt(setInput.val(), 10)) && parseInt(setInput.val(), 10) >= 0) {
                doBulkStock('set');
            } else if (incVal > 0) {
                doBulkStock('increase');
            } else if (decVal > 0) {
                doBulkStock('decrease');
            } else {
                showToast(params.enter_positive || 'Please enter a positive number.');
            }
        });

        // Bulk low stock threshold
        $('#otm-inventory-bulk-threshold-btn').on('click', function() {
            var ids = getSelectedProductIds();
            if (ids.length === 0) {
                showToast(params.bulk_select_first || 'Please select one or more rows.');
                return;
            }
            var val = parseInt($('#otm-inventory-bulk-threshold-value').val(), 10);
            if (isNaN(val)) val = 0;
            var btn = $(this);
            btn.prop('disabled', true);
            $.post(params.ajax_url, {
                action: 'wotm_inventory_bulk_low_stock_threshold',
                nonce: params.nonce,
                product_ids: ids,
                value: val
            }).done(function(res) {
                if (res.success && res.data && res.data.message) {
                    closeBulkModal();
                    showToast(res.data.message);
                    loadList();
                    loadSummary();
                    $('#otm-inventory-table-container .otm-inventory-row-checkbox').prop('checked', false);
                    $('#otm-inventory-table-container #otm-inventory-select-all').prop('checked', false);
                    $('#otm-inventory-table-container .com-table tbody tr').removeClass('selected');
                    updateBulkBarVisibility();
                } else {
                    showToast(res.data && res.data.message ? res.data.message : (params.update_failed || 'Update failed.'));
                }
            }).fail(function() {
                showToast(params.update_failed || 'Update failed. Please try again.');
            }).always(function() {
                btn.prop('disabled', false);
            });
        });

        // Bulk enable stock
        $('#otm-inventory-bulk-enable-stock-btn').on('click', function() {
            var ids = getSelectedProductIds();
            if (ids.length === 0) {
                showToast(params.bulk_select_first || 'Please select one or more rows.');
                return;
            }
            var promptText = params.enable_stock_prompt || "Enter current stock amount:\n\n(Please ensure you update this regularly. If stock reaches 0, customers will not be able to place orders.)";
            var initialStock = prompt(promptText, "100");
            if (initialStock === null) {
                return;
            }
            initialStock = parseInt(initialStock, 10);
            if (isNaN(initialStock) || initialStock < 0) {
                 showToast(params.enter_positive || "Please enter a positive number.");
                 return;
            }
            var btn = $(this);
            btn.prop('disabled', true);
            $.post(params.ajax_url, {
                action: 'wotm_inventory_bulk_enable_stock',
                nonce: params.nonce,
                product_ids: ids,
                initial_stock: initialStock
            }).done(function(res) {
                if (res.success && res.data && res.data.message) {
                    closeBulkModal();
                    showToast(res.data.message);
                    loadList();
                    loadSummary();
                    $('#otm-inventory-table-container .otm-inventory-row-checkbox').prop('checked', false);
                    $('#otm-inventory-table-container #otm-inventory-select-all').prop('checked', false);
                    $('#otm-inventory-table-container .com-table tbody tr').removeClass('selected');
                    updateBulkBarVisibility();
                } else {
                    showToast(res.data && res.data.message ? res.data.message : (params.update_failed || 'Update failed.'));
                }
            }).fail(function() {
                showToast(params.update_failed || 'Update failed. Please try again.');
            }).always(function() {
                btn.prop('disabled', false);
            });
        });

        // Column resizer (inventory table only)
        var invResizing = false;
        var invCurrentTh = null;
        var invStartOffset = 0;
        $(document).on('mousedown', '#otm-inventory-table-container .resizer', function(e) {
            e.stopPropagation();
            invResizing = true;
            invCurrentTh = $(this).closest('th');
            invStartOffset = invCurrentTh.width() - e.pageX;
        });
        $(document).on('mousemove', function(e) {
            if (invResizing && invCurrentTh && invCurrentTh.length) {
                e.preventDefault();
                var newWidth = Math.max(20, invStartOffset + e.pageX);
                invCurrentTh.width(newWidth);
            }
        });
        $(document).on('mouseup', function() {
            if (invResizing) {
                var finalWidth = invCurrentTh && invCurrentTh.length ? Math.round(invCurrentTh.width()) : 0;
                var colKey = invCurrentTh && invCurrentTh.length ? invCurrentTh.data('key') : '';
                invResizing = false;
                invCurrentTh = null;
                updateInventoryTableScrollWidth();
                if (colKey && finalWidth >= 20) {
                    $.post(params.ajax_url, {
                        action: 'otm_save_inventory_column_width',
                        nonce: params.nonce,
                        col_key: colKey,
                        width: finalWidth
                    });
                }
            }
        });
    });
})(jQuery);
