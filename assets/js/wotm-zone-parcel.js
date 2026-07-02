/**
 * Zone Change → Steadfast parcel window:
 * - Pipe data from matched Ready order (server AJAX).
 * - Notes sync: cross-origin Steadfast often has window.opener = null, so postMessage fails.
 *   We poll the Window returned by window.open(); when it closes, we POST from this tab (real cookies).
 */
(function ($) {
    'use strict';

    var STEADFAST_WIN_NAME = 'otmSteadfastParcel';
    var _otmParcelMsgDedupe = '';
    /** Prevent double POST (postMessage + poll, or double poll). */
    var _parcelNotesDone = {};

    function base64UrlEncodeJson(obj) {
        var s = JSON.stringify(obj);
        var b64 = btoa(unescape(encodeURIComponent(s)));
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function openSteadfastWithPayload(steadfastUrl, payload) {
        var hash = 'otmParcel=' + base64UrlEncodeJson(payload);
        var base = steadfastUrl.replace(/#.*$/, '');
        return window.open(base + '#' + hash, STEADFAST_WIN_NAME);
    }

    function expectedAjaxOrigin() {
        try {
            return new URL(all_order_list_params.ajax_url).origin;
        } catch (e) {
            return '';
        }
    }

    function isSteadfastMessageOrigin(origin) {
        return (
            origin === 'https://steadfast.com.bd' ||
            origin === 'https://www.steadfast.com.bd' ||
            origin === window.location.origin
        );
    }

    /**
     * Apply Zone + Ready notes via admin-ajax (same tab = session cookies).
     * @param {number} attempt 1 = first try; 2 = one automatic retry after transient failure.
     */
    function requestParcelNotesAjax(zoneOrderId, readyOrderId, security, sourceTag, attempt) {
        if (typeof all_order_list_params === 'undefined' || !all_order_list_params.ajax_url) {
            return;
        }
        attempt = attempt || 1;
        var k = String(zoneOrderId) + '_' + String(readyOrderId);
        if (_parcelNotesDone[k]) {
            return;
        }
        _parcelNotesDone[k] = true;

        if (typeof console !== 'undefined' && console.log) {
            console.log('[OTM Parcel] Notes sync: ' + (sourceTag || 'ajax') + ' zone=' + zoneOrderId + ' ready=' + readyOrderId + (attempt > 1 ? ' (retry)' : ''));
        }

        var sec =
            attempt > 1 && typeof WOTM_APP !== 'undefined' && WOTM_APP.ajaxNonce
                ? WOTM_APP.ajaxNonce
                : security;

        $.post(all_order_list_params.ajax_url, {
            action: 'otm_zone_steadfast_parcel_notes',
            security: sec,
            zone_order_id: zoneOrderId,
            ready_order_id: readyOrderId
        }, function (response) {
            if (!response || !response.success) {
                _parcelNotesDone[k] = false;
                var msg = 'Notes update failed.';
                var d = response && response.data;
                if (typeof d === 'string') {
                    msg = d;
                } else if (d && typeof d === 'object' && d.message) {
                    msg = String(d.message);
                }
                var maybeNonce =
                    response && response.data && response.data.new_nonce ? response.data.new_nonce : '';
                if (maybeNonce && typeof WOTM_APP !== 'undefined' && WOTM_APP.updateNonce) {
                    WOTM_APP.updateNonce(maybeNonce);
                }
                if (attempt < 2 && /nonce|security|token|session/i.test(msg)) {
                    setTimeout(function () {
                        requestParcelNotesAjax(zoneOrderId, readyOrderId, sec, sourceTag || 'retry-nonce', 2);
                    }, 400);
                    return;
                }
                if (attempt < 2) {
                    setTimeout(function () {
                        requestParcelNotesAjax(zoneOrderId, readyOrderId, sec, sourceTag || 'retry', 2);
                    }, 1800);
                    return;
                }
                if (typeof WOTM_APP !== 'undefined' && WOTM_APP.showToast) {
                    WOTM_APP.showToast(msg);
                } else {
                    window.alert(msg);
                }
                return;
            }
            if (typeof WOTM_APP !== 'undefined' && WOTM_APP.updateNonce && response.data.new_nonce) {
                WOTM_APP.updateNonce(response.data.new_nonce);
            }
            if (response.data.live_rows && typeof WOTM_APP.applyLiveOrderRowPatch === 'function') {
                Object.keys(response.data.live_rows).forEach(function (oid) {
                    var row = $('#orders-table-container tr.com-row[data-order-id="' + oid + '"]');
                    if (row.length) {
                        WOTM_APP.applyLiveOrderRowPatch(row, response.data.live_rows[oid]);
                    }
                });
            }
            if (typeof WOTM_APP !== 'undefined' && WOTM_APP.showToast) {
                WOTM_APP.showToast(response.data.message || 'Notes updated.');
            }
        })
            .fail(function () {
                _parcelNotesDone[k] = false;
                if (attempt < 2) {
                    setTimeout(function () {
                        requestParcelNotesAjax(zoneOrderId, readyOrderId, security, sourceTag || 'retry-net', 2);
                    }, 2000);
                    return;
                }
                if (typeof WOTM_APP !== 'undefined' && WOTM_APP.showToast) {
                    WOTM_APP.showToast('Notes request failed.');
                }
            });
    }

    function applyNotesFromSteadfastMessage(data) {
        var origin = expectedAjaxOrigin();
        if (!origin || !data.ajaxUrl || data.ajaxUrl.indexOf(origin) !== 0) {
            return;
        }
        var dedupeKey = String(data.zone_order_id) + '_' + String(data.ready_order_id);
        if (_otmParcelMsgDedupe === dedupeKey) {
            return;
        }
        _otmParcelMsgDedupe = dedupeKey;
        setTimeout(function () {
            _otmParcelMsgDedupe = '';
        }, 4000);

        requestParcelNotesAjax(data.zone_order_id, data.ready_order_id, data.security, 'postMessage', 1);
    }

    window.addEventListener('message', function (ev) {
        if (!ev.data || ev.data.type !== 'otm_steadfast_parcel_done') {
            return;
        }
        if (typeof all_order_list_params === 'undefined') {
            return;
        }
        if (!isSteadfastMessageOrigin(ev.origin)) {
            return;
        }
        applyNotesFromSteadfastMessage(ev.data);
    });

    /**
     * When Steadfast window closes, sync notes from this (OTM) tab.
     * minOpenMs: ignore instant closes (mis-clicks) — full parcel flow usually takes longer.
     */
    function watchSteadfastWindowForNotesSync(win, zoneOrderId, readyOrderId, security, openedAtMs) {
        // Removed win.closed polling. The Chrome Extension now handles synchronization reliably,
        // preventing the bug where premature tab closing incorrectly updated the WP notes.
    }

    $(document).on('click', '.otm-zone-parcel-steadfast-btn', function (e) {
        if (this.tagName === 'SPAN' || $(this).hasClass('otm-zone-parcel-steadfast-btn--disabled')) {
            e.preventDefault();
            return;
        }
        if (typeof window.all_order_list_params === 'undefined') {
            return;
        }

        var $btn = $(this);
        var steadfastUrl = $btn.data('steadfast-url') || '';
        var zoneOrderId = parseInt($btn.data('zone-order-id'), 10);
        var readyOrderId = parseInt($btn.data('ready-order-id'), 10);
        if (!steadfastUrl || !zoneOrderId || !readyOrderId) {
            return;
        }

        var nonce = typeof WOTM_APP !== 'undefined' && WOTM_APP.ajaxNonce ? WOTM_APP.ajaxNonce : all_order_list_params.nonce;

        e.preventDefault();

        $.post(
            all_order_list_params.ajax_url,
            {
                action: 'otm_zone_parcel_pipe',
                security: nonce,
                zone_order_id: zoneOrderId,
                ready_order_id: readyOrderId
            },
            function (response) {
                if (!response || !response.success || !response.data || !response.data.pipe) {
                    var msg =
                        response && response.data && typeof response.data === 'string'
                            ? response.data
                            : 'Could not load Ready order data for parcel.';
                    if (typeof WOTM_APP !== 'undefined' && WOTM_APP.showToast) {
                        WOTM_APP.showToast(msg);
                    } else {
                        window.alert(msg);
                    }
                    return;
                }
                if (typeof WOTM_APP !== 'undefined' && WOTM_APP.updateNonce && response.data.new_nonce) {
                    WOTM_APP.updateNonce(response.data.new_nonce);
                }

                var noteNonce = response.data.new_nonce || nonce;
                var payload = {
                    v: 1,
                    pipe: response.data.pipe,
                    ajaxUrl: all_order_list_params.ajax_url,
                    action: 'otm_zone_steadfast_parcel_notes',
                    security: noteNonce,
                    zone_order_id: zoneOrderId,
                    ready_order_id: readyOrderId,
                    autoSubmit: true,
                    notifyDelayMs: 4000
                };
                var openedAt = Date.now();
                var childWin = openSteadfastWithPayload(steadfastUrl, payload);
                if (!childWin || typeof childWin.closed === 'undefined') {
                    if (typeof WOTM_APP !== 'undefined' && WOTM_APP.showToast) {
                        WOTM_APP.showToast('Pop-up blocked. Allow pop-ups for this site, then try again.');
                    } else {
                        window.alert('Pop-up blocked.');
                    }
                    return;
                }
                watchSteadfastWindowForNotesSync(childWin, zoneOrderId, readyOrderId, noteNonce, openedAt);
            }
        ).fail(function () {
            if (typeof WOTM_APP !== 'undefined' && WOTM_APP.showToast) {
                WOTM_APP.showToast('Request failed. Check connection and try again.');
            } else {
                window.alert('Request failed.');
            }
        });
    });
})(jQuery);
