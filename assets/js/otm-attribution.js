/**
 * First / last touch UTM (+ optional fbclid) for WooCommerce orders.
 * Site-wide, no jQuery; pairs with order-attribution.php (cookies read at checkout).
 */
(function () {
    'use strict';

    var LS_FIRST = 'otm_attr_first';
    var LS_LAST = 'otm_attr_last';
    var CK_FIRST = 'otm_attr_first';
    var CK_LAST = 'otm_attr_last';
    var MAX_AGE = 90 * 24 * 60 * 60;

    function readCookie(name) {
        var esc = name.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
        var m = document.cookie.match(new RegExp('(?:^|; )' + esc + '=([^;]*)'));
        return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }

    function setCookie(name, value) {
        document.cookie =
            name +
            '=' +
            encodeURIComponent(value) +
            ';path=/;max-age=' +
            MAX_AGE +
            ';SameSite=Lax';
    }

    function lsGet(k) {
        try {
            return localStorage.getItem(k);
        } catch (e) {
            return null;
        }
    }

    function lsSet(k, v) {
        try {
            localStorage.setItem(k, v);
        } catch (e) {}
    }

    function buildSnapshot(params) {
        return {
            utm_source: params.utm_source || '',
            utm_medium: params.utm_medium || '',
            utm_campaign: params.utm_campaign || '',
            utm_content: params.utm_content || '',
            fbclid: params.fbclid || '',
            captured_at: new Date().toISOString(),
            landing_path: window.location.pathname + window.location.search
        };
    }

    function touchFromUrl() {
        var s = window.location.search;
        if (!s || s.length < 2) {
            return null;
        }
        var p = new URLSearchParams(s);
        var utm_source = (p.get('utm_source') || '').trim();
        var utm_medium = (p.get('utm_medium') || '').trim();
        var utm_campaign = (p.get('utm_campaign') || '').trim();
        var utm_content = (p.get('utm_content') || '').trim();
        var fbclid = (p.get('fbclid') || '').trim();

        var hasUtm = utm_source || utm_medium || utm_campaign || utm_content;
        if (hasUtm) {
            return buildSnapshot({
                utm_source: utm_source,
                utm_medium: utm_medium,
                utm_campaign: utm_campaign,
                utm_content: utm_content,
                fbclid: fbclid
            });
        }
        if (fbclid) {
            return buildSnapshot({
                utm_source: '',
                utm_medium: '',
                utm_campaign: '',
                utm_content: '',
                fbclid: fbclid
            });
        }
        return null;
    }

    function hasFirstStored() {
        if (lsGet(LS_FIRST)) {
            return true;
        }
        var c = readCookie(CK_FIRST);
        return !!(c && c.length > 1);
    }

    function restoreCookieFromLs(lsKey, ckKey) {
        var j = lsGet(lsKey);
        if (j && (!readCookie(ckKey) || readCookie(ckKey).length < 2)) {
            setCookie(ckKey, j);
        }
    }

    restoreCookieFromLs(LS_FIRST, CK_FIRST);
    restoreCookieFromLs(LS_LAST, CK_LAST);

    var snap = touchFromUrl();
    if (!snap) {
        return;
    }

    var json = JSON.stringify(snap);

    if (!hasFirstStored()) {
        lsSet(LS_FIRST, json);
        setCookie(CK_FIRST, json);
    }

    lsSet(LS_LAST, json);
    setCookie(CK_LAST, json);
})();
