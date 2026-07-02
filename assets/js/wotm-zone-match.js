/**
 * Zone Change tab: background zone matching vs Ready for Delivery (Match column saves via pen icon in wotm-table-events.js).
 */
(function($) {
    'use strict';

    var computeTimer = null;
    var COMPUTE_DEBOUNCE_MS = 350;

    function getParams() {
        if (typeof window.all_order_list_params === 'undefined' || typeof WOTM_APP === 'undefined') {
            return null;
        }
        var last = WOTM_APP.lastOrdersFetchParams;
        if (!last) {
            return null;
        }
        var filters = last.filters || {};
        var search = '';
        if (last.search != null && last.search !== '') {
            search = last.search;
        } else if (last.term != null && last.term !== '') {
            search = last.term;
        }
        return {
            action: 'otm_zone_match_compute',
            security: WOTM_APP.ajaxNonce,
            filters: filters,
            search: search
        };
    }

    function patchCells(updates) {
        if (!updates || typeof updates !== 'object') {
            return;
        }
        Object.keys(updates).forEach(function(oid) {
            var u = updates[oid];
            if (!u || !u.html) {
                return;
            }
            var $td = $('#orders-table-container tr.com-row[data-order-id="' + oid + '"] td.otm-column-match');
            if ($td.length) {
                $td.html(u.html);
            }
        });
    }

    window.WOTM_ZoneMatch = {
        scheduleComputeFromLastParams: function() {
            return; // Disabled as computation now happens synchronously on server
            if (WOTM_APP.currentTab !== 'wc-otm-zone-chan') {
                return;
            }
            if (computeTimer) {
                clearTimeout(computeTimer);
            }
            computeTimer = setTimeout(function() {
                computeTimer = null;
                var post = getParams();
                if (!post) {
                    return;
                }
                $.post(all_order_list_params.ajax_url, post, function(response) {
                    if (response.success) {
                        WOTM_APP.updateNonce(response.data.new_nonce);
                        patchCells(response.data.updates);
                        if (typeof WOTM_APP.updateOrdersTableScrollWidth === 'function') {
                            WOTM_APP.updateOrdersTableScrollWidth();
                        }
                        return;
                    }
                    var d = response && response.data;
                    if (d && d.new_nonce && typeof WOTM_APP.updateNonce === 'function') {
                        WOTM_APP.updateNonce(d.new_nonce);
                    }
                });
            }, COMPUTE_DEBOUNCE_MS);
        }
    };
})(jQuery);
