<?php
/**
 * WOTM runtime hardening (PLAIN SHIM - always plain PHP).
 *
 * As of v1.13 the bodies of the hardening callbacks moved into
 * `includes/secure/hardening-impl.php` so they can ship as protected
 * encoded bytecode (plain encryption, no external/dynamic key). The
 * `add_action()` registrations stay plain here so the hooks register on
 * every request regardless of loader availability - that way:
 *
 *   - When the impl loaded successfully, the hook callbacks do their
 *     real work (prewarm on license change, proactive revoke cron,
 *     canary cron, admin notices, etc.).
 *
 *   - When the impl did not load (loader off, impl file missing or
 *     corrupt), the fallback no-op stubs below preserve the callback
 *     symbols so WordPress does not trip on "Call to undefined function"
 *     when it fires the hook. The plugin features silently turn off;
 *     the customer's site stays alive.
 *
 * @package woocommerce-easy-order-manager
 */

if (!defined('ABSPATH')) {
    exit;
}

/* =========================================================================
 * Cron event names - plain constants so deactivation hooks in the main
 * plugin file can reference them without needing the encoded impl.
 * ========================================================================= */
if (!defined('WOTM_CRON_PROACTIVE')) {
    define('WOTM_CRON_PROACTIVE', 'wotm_proactive_key_check');
}
if (!defined('WOTM_CRON_CANARY')) {
    define('WOTM_CRON_CANARY', 'wotm_canary_alive_check');
}

/* =========================================================================
 * Load the encoded implementation.
 * ========================================================================= */

$wotm_hardening_impl_path = __DIR__ . DIRECTORY_SEPARATOR . 'secure' . DIRECTORY_SEPARATOR . 'hardening-impl.php';
if (
    file_exists($wotm_hardening_impl_path)
    && function_exists('wotm_preflight_php_file')
    && wotm_preflight_php_file($wotm_hardening_impl_path)
) {
    require_once $wotm_hardening_impl_path;
}
unset($wotm_hardening_impl_path);

/* =========================================================================
 * Fallback no-op stubs. Defined only when the encoded impl did not
 * provide them (i.e. loader off, impl file missing, or corrupt).
 * ========================================================================= */

if (!function_exists('wotm_hardening_schedule_crons')) {
    function wotm_hardening_schedule_crons() {
        // No-op. If the impl is dormant there is nothing meaningful to
        // schedule (the cron callbacks themselves are no-ops too).
    }
}
if (!function_exists('wotm_hardening_unschedule_crons')) {
    function wotm_hardening_unschedule_crons() {
        if (function_exists('wp_clear_scheduled_hook')) {
            if (defined('WOTM_CRON_PROACTIVE')) {
                wp_clear_scheduled_hook(WOTM_CRON_PROACTIVE);
            }
            if (defined('WOTM_CRON_CANARY')) {
                wp_clear_scheduled_hook(WOTM_CRON_CANARY);
            }
        }
    }
}
if (!function_exists('wotm_hardening_on_license_key_change')) {
    function wotm_hardening_on_license_key_change($option, $old_value, $value) {}
}
if (!function_exists('wotm_hardening_on_license_key_added')) {
    function wotm_hardening_on_license_key_added($option, $value) {}
}
if (!function_exists('wotm_proactive_key_check_callback')) {
    function wotm_proactive_key_check_callback() {}
}
if (!function_exists('wotm_proactive_wipe_key_file')) {
    function wotm_proactive_wipe_key_file($reason) {}
}
if (!function_exists('wotm_canary_alive_check_callback')) {
    function wotm_canary_alive_check_callback() {}
}
if (!function_exists('wotm_canary_admin_notice')) {
    function wotm_canary_admin_notice() {}
}
if (!function_exists('wotm_canary_network_admin_notice')) {
    function wotm_canary_network_admin_notice() {}
}

/* =========================================================================
 * Hook registrations - ALWAYS PLAIN.
 *
 * Registering these here (not inside the encoded impl) means the hooks
 * are wired up regardless of loader state. When the impl is loaded,
 * the callbacks resolve to the real (encoded) implementations; when it
 * is not, they resolve to the no-op stubs above.
 * ========================================================================= */

// Self-heal: re-schedule recurring jobs on every wp-loaded in case a
// host cleared them between requests.
add_action('wp_loaded', 'wotm_hardening_schedule_crons');

// License-key change listeners - plain wiring, encoded payload.
add_action('updated_option', 'wotm_hardening_on_license_key_change', 10, 3);
add_action('added_option',   'wotm_hardening_on_license_key_added',   10, 2);

// Recurring jobs.
add_action(WOTM_CRON_PROACTIVE, 'wotm_proactive_key_check_callback');
add_action(WOTM_CRON_CANARY,    'wotm_canary_alive_check_callback');

// Admin-notice surfaces.
add_action('admin_notices',          'wotm_canary_admin_notice');
add_action('network_admin_notices',  'wotm_canary_network_admin_notice');
