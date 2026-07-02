<?php

/**
 * Plugin Name: WooCommerce Easy Order Manager
 * Description: Manage all WooCommerce orders in one simple table. View, filter, assign staff, print invoices, and handle courier & SMS from one place.
 * Version: 3.26.14
 * Author: Easy Order Manager
 * Author URI: https://easyordermanager.com.bd/
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('WOTM_PLUGIN_PATH')) {
    define('WOTM_PLUGIN_PATH', plugin_dir_path(__FILE__));
}

if (!defined('WOTM_PLUGIN_URL')) {
    define('WOTM_PLUGIN_URL', plugin_dir_url(__FILE__));
}

if (!defined('WOTM_PLUGIN_BASENAME')) {
    define('WOTM_PLUGIN_BASENAME', plugin_basename(__FILE__));
}

// === BUILD-STAMP BEGIN ===
// Forever-constant defaults under the simplified BUILD-GUIDE workflow:
// the operator runs generate-release-keys.ps1 ONCE and then ships every
// release with the same WOTM_KEY_REVISION. They only need to bump
// this value if the keys are ever regenerated with -Force, or if the
// runtime key path/filename changes (which forces a revision bump
// because old encoded files would not be able to find the new path).
// WOTM_VERSION is informational (User-Agent + diagnostic blob); the
// canonical version that WP shows in the Plugins screen is the
// "* Version:" docblock at the top of this file.
if (!defined('WOTM_VERSION')) {
    define('WOTM_VERSION', '3.26.14');
}
if (!defined('WOTM_KEY_REVISION')) {
    // Revision history:
    //   1 → 2  v1.10 switch to file-mode external keys (Guide §4.2.1).
    //   2 → 3  v1.11 runtime key path renamed data/ek.bin → data/.ek
    //          (no `.bin` extension + leading-dot hidden filename). Encoded
    //          files baked with file:data/.ek=<bin> cannot decode against
    //          the legacy data/ek.bin, so a revision bump is mandatory.
    //   3 → 4  v1.12 runtime EXTERNAL key file relocated from
    //          <plugin>/data/.ek to <wp-content>/uploads/.ek/.ek (folder
    //          ".ek" with file ".ek"; ".ek" = "external key" - distinct
    //          from the dynamic key which is never written to disk).
    //          The Loader's relative-path parent walk for "uploads/.ek/.ek"
    //          lands on wp-content/uploads/.ek/.ek on every standard WP
    //          layout, so the plugin folder no longer holds the key blob -
    //          a manual plugin re-upload / "wp plugin delete & reinstall"
    //          can no longer wipe the local key. Encoded files baked with
    //          file:uploads/.ek/.ek=<bin> cannot decode against the legacy
    //          data/.ek path, so a revision bump is mandatory. Bootstrap
    //          auto-deletes the orphan <plugin>/data/.ek + ek.bin and the
    //          now-empty data/ folder after the new file lands (see
    //          wotm-key-bootstrap.php → wotm_cleanup_legacy_plugin_key_artifacts()).
    define('WOTM_KEY_REVISION', 4);
}
// === BUILD-STAMP END ===

if (!defined('WOTM_IONCUBE_HELP_PLAYLIST_URL')) {
    define('WOTM_IONCUBE_HELP_PLAYLIST_URL', 'https://www.youtube.com/playlist?list=PL7nOHIVbp1E4RtWDuCguEtinQ8fysf5vI');
}

// Preflight helpers (plain PHP, zero deps) - MUST be loaded first so every
// subsequent `require_once` of a file that might be protected bytecode
// can sanity-check it before the Loader attempts to decode. Prevents
// fatal-at-decode from truncated / corrupt / wrong-format encoded files
// (per WOTM-OUTER-ENCODE-AND-LOADER-RESILIENCE-PLAN §7.4).
require_once WOTM_PLUGIN_PATH . 'includes/wotm-preflight.php';

// Key bootstrap - plain PHP shim (v1.13+). Defines stable constants and
// public-API function symbols; the HMAC/KDF/OTL-payload logic lives in the
// protected `includes/secure/key-impl.php` (plain encryption, no
// external/dynamic key). Must load BEFORE core-loader runs so the
// dynamic-key helper exists when the loader needs to invoke it for
// the inner-core spine files.
require_once WOTM_PLUGIN_PATH . 'includes/wotm-key-bootstrap.php';

// Operational hardening - canary cron, proactive revoke check, license-key
// change listener, multisite/network notices. Loaded unconditionally because
// its hooks need to register even when encoded core fails to load (so the
// admin still sees short status notices).
require_once WOTM_PLUGIN_PATH . 'includes/wotm-key-hardening.php';

/**
 * Environment check for protected core (this file and core-loader stay plain PHP).
 * Used before loading core so a missing Loader never calls wp_die() on public pages.
 *
 * @return array{ok: bool, reason: string}
 */
function wotm_environment_allows_core() {
    if (!extension_loaded('ionCube Loader')) {
        return ['ok' => false, 'reason' => 'ioncube'];
    }
    // v1.10: Loader 14.4+ is required for the file-mode external key path:
    //   §4.2.1 says "When encoded with version 14 or later and run using
    //   Loader 14.4.0 and above, the Loader will also search for a relative
    //   key path in parent directories of the script". 14.4 is also the
    //   minimum that still supports the dynamic-key callback the spine needs.
    // Older Loaders refuse to walk parents and will fatal with "encoding key
    // was not found" mid-request. Pin a hard floor here so we degrade
    // gracefully instead.
    if (function_exists('ioncube_loader_version')) {
        $loader = (string) ioncube_loader_version();
        if (version_compare($loader, '14.4', '<')) {
            return ['ok' => false, 'reason' => 'loader_too_old'];
        }
    }
    $major = PHP_MAJOR_VERSION;
    $minor = PHP_MINOR_VERSION;
    // Per BUILD-GUIDE: bytecode is encoded at Target PHP 8.1 and is
    // forward-compatible, so 8.1 / 8.2 / 8.3 / 8.4 / 8.5
    // are all supported. PHP 8.0 is rejected.
    if ($major === 8 && in_array($minor, [1, 2, 3, 4, 5], true)) {
        return ['ok' => true, 'reason' => 'ok'];
    }
    if ($major === 8 && $minor === 0) {
        return ['ok' => false, 'reason' => 'php80'];
    }
    return ['ok' => false, 'reason' => 'php_unsupported'];
}

// HPOS: declare compatibility unconditionally - only the plugin file path is needed, not the encoded core.
add_action('before_woocommerce_init', function () {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
    }
});

// Load the centralized core loader (plain PHP). Encoded modules load only when environment passes.
require_once WOTM_PLUGIN_PATH . 'includes/core-loader.php';

/**
 * Deactivation must not fatal if the encoded core never loaded (e.g. loader removed later).
 */
function wotm_deactivation_bridge() {
    if (function_exists('wotm_on_deactivation')) {
        wotm_on_deactivation();
    }
}

register_deactivation_hook(__FILE__, 'wotm_deactivation_bridge');

/**
 * Create the public "[easy_order_manager]" page even when encoded core did not
 * load on activation (e.g. missing license / key bootstrap). Core's
 * wotm_on_activation() only registers when WOTM_CORE_LOADED, so this hook keeps
 * "Go to Order Manager Page" working immediately after first activate.
 */
function wotm_activation_ensure_public_order_manager_page() {
    $page_title = 'Easy Order Manager';
    $page_content = '[easy_order_manager]';

    $query = new WP_Query([
        'post_type'      => 'page',
        'title'          => $page_title,
        'post_status'    => 'publish',
        'posts_per_page' => 1,
    ]);
    $page_check = $query->posts ? $query->posts[0] : null;
    if ($page_check !== null) {
        return;
    }

    $page_id = wp_insert_post([
        'post_type'    => 'page',
        'post_title'   => $page_title,
        'post_content' => $page_content,
        'post_status'  => 'publish',
        'post_author'  => (function_exists('get_current_user_id') ? (get_current_user_id() ?: 1) : 1),
    ], true);
    if ($page_id && !is_wp_error($page_id)) {
        update_post_meta((int) $page_id, '_wp_page_template', 'template-wotm-canvas.php');
    }
}

register_activation_hook(__FILE__, 'wotm_activation_ensure_public_order_manager_page');

/**
 * On fresh activation, immediately stamp the current version into the DB.
 * This prevents wotm_run_activation_on_update() from firing redundantly on
 * the very next page load (activation already ran everything; no need to repeat).
 *
 * MUST be outside the WOTM_CORE_LOADED block so it runs even when the core
 * could not load (e.g. missing license key). Without this stamp, a fresh
 * activation without a license would cause wotm_run_activation_on_update() to
 * fire on the next page load when CORE_LOADED is still false and
 * wotm_on_activation() does not exist yet.
 */
function wotm_set_installed_version_on_activation() {
    update_option( 'wotm_installed_version', WOTM_VERSION );
}
register_activation_hook( __FILE__, 'wotm_set_installed_version_on_activation' );

if (defined('WOTM_CORE_LOADED') && WOTM_CORE_LOADED) {
    register_activation_hook(__FILE__, 'wotm_on_activation');
    // §6.5.5: warm the local key file at activation so the first public hit
    // doesn't pay the OTL round-trip latency. Failure is non-fatal - we already
    // have an admin notice path for missing keys.
    register_activation_hook(__FILE__, 'wotm_activation_prewarm_keys');
    // §6.5.5: opcache_reset on (de)activation so a stale opcache cannot serve
    // the previous build's encoded files after a key-revision bump.
    register_activation_hook(__FILE__, 'wotm_reset_opcache_safe');
    register_deactivation_hook(__FILE__, 'wotm_reset_opcache_safe');
    // Phase E: schedule the canary + proactive revoke crons on activation,
    // clear them on deactivation. The hardening file also self-heals via the
    // wp_loaded hook in case a host's cron table is wiped.
    register_activation_hook(__FILE__, 'wotm_hardening_schedule_crons');
    register_deactivation_hook(__FILE__, 'wotm_hardening_unschedule_crons');
    add_filter('plugin_action_links_' . WOTM_PLUGIN_BASENAME, 'wotm_add_settings_link');
    /**
     * Self-heal role capabilities if activation never ran (e.g. first activate without loader) or another plugin reset caps.
     * Does not replace wotm_on_activation(); only ensures caps that the order table shortcode and AJAX expect.
     */
    add_action('init', 'wotm_ensure_bootstrap_capabilities', 10);
    // Auto-run activation tasks when a newer plugin version is detected.
    // Priority 15 ensures wotm_ensure_bootstrap_capabilities (priority 10) runs first.
    add_action( 'init', 'wotm_run_activation_on_update', 15 );
} else {
    add_action('admin_notices', 'wotm_admin_notice_requirements_failed');
    register_activation_hook(__FILE__, 'wotm_activation_requirements_failed');
    // Self-recovery UI: when the encoded core failed to load for a reason the
    // admin can fix from inside WordPress, register the same admin slug as the
    // full app (easy-order-manager) with an unencoded license form so the URL
    // matches normal "Activate your license in Easy Order Manager" flows.
    add_action('admin_menu', 'wotm_register_license_setup_menu');
    add_action('admin_post_wotm_save_license_setup', 'wotm_handle_license_setup_submit');
}

/**
 * Whether the plugin can recover from this failure by an admin filling in
 * a form inside WordPress (license key entry, etc.). Non-recoverable codes
 * (loader extension missing, PHP version unsupported, file truly missing)
 * require server-side or re-upload action and we keep auto-deactivation for
 * those.
 *
 * @param string $code Failure code recorded by wotm_record_failure().
 * @return bool
 */
function wotm_is_recoverable_failure_code($code) {
    $recoverable = [
        'no_license',
        'key_bootstrap',
        'validate_failed',
        'external_key_http_failed',
        'dynamic_key_http_failed',
        'domain_mismatch',
        'license_expired',
        'license_revoked',
        'license_inactive',
        'no_writable_tier',
        'mkdir_failed',
        'tmp_write_failed',
        'atomic_rename_failed',
        'ini_set_blocked',
        'ini_set_disabled',
        'hmac_failed',
        'hmac_nonce_mismatch',
        'hmac_freshness_fail',
        'payload_sha_mismatch',
        'base64_decode_failed',
        'external_key_response_invalid',
        'dynamic_key_response_invalid',
        'key_revision_mismatch',
        'build_revision_missing',
        'validate_busy',
        'bootstrap_exception',
        'key_path_missing',
    ];
    return in_array((string) $code, $recoverable, true);
}

/**
 * Mirror the capability grants from wotm_on_activation() when they are missing (lightweight, guarded).
 */
function wotm_ensure_bootstrap_capabilities() {
    if (!defined('WOTM_CORE_LOADED') || !WOTM_CORE_LOADED) {
        return;
    }
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $updated = false;

    $admin_role = get_role('administrator');
    if ($admin_role) {
        if (!$admin_role->has_cap('manage_wotm_order_table')) {
            $admin_role->add_cap('manage_wotm_order_table');
            $updated = true;
        }
        if (!$admin_role->has_cap('can_assign_orders')) {
            $admin_role->add_cap('can_assign_orders');
            $updated = true;
        }
    }

    $staff_role = get_role('easy_order_staff');
    if (!$staff_role) {
        add_role(
            'easy_order_staff',
            'Easy Order (Staff)',
            [
                'read' => true,
                'edit_shop_orders' => true,
                'manage_wotm_order_table' => true,
                'manage_assigned_orders' => true,
            ]
        );
        $staff_role = get_role('easy_order_staff');
        $updated = true;
    }
    if ($staff_role) {
        // manage_wotm_order_table is the primary cap checked by the frontend shortcode.
        // If it is missing the user sees "You are not allowed to view this." even after
        // a fresh staff-account creation, because the role definition in wp_user_roles
        // had the cap stripped (e.g. by deactivation/reactivation or another plugin).
        if (!$staff_role->has_cap('manage_wotm_order_table')) {
            $staff_role->add_cap('manage_wotm_order_table');
            $updated = true;
        }
        if (!$staff_role->has_cap('edit_shop_orders')) {
            $staff_role->add_cap('edit_shop_orders');
            $updated = true;
        }
        if (!$staff_role->has_cap('manage_assigned_orders')) {
            $staff_role->add_cap('manage_assigned_orders');
            $updated = true;
        }
    }
    $manager_role = get_role('easy_order_manager');
    if (!$manager_role) {
        add_role(
            'easy_order_manager',
            'Easy Order (Manager)',
            [
                'read' => true,
                'edit_shop_orders' => true,
                'manage_wotm_order_table' => true,
                'can_assign_orders' => true,
                'manage_assigned_orders' => true,
            ]
        );
        $manager_role = get_role('easy_order_manager');
        $updated = true;
    }
    if ($manager_role) {
        if (!$manager_role->has_cap('manage_wotm_order_table')) {
            $manager_role->add_cap('manage_wotm_order_table');
            $updated = true;
        }
        if (!$manager_role->has_cap('edit_shop_orders')) {
            $manager_role->add_cap('edit_shop_orders');
            $updated = true;
        }
        if (!$manager_role->has_cap('manage_assigned_orders')) {
            $manager_role->add_cap('manage_assigned_orders');
            $updated = true;
        }
        // easy_order_manager must also carry can_assign_orders so that
        // order-assignment, bulk-SMS and profit/loss AJAX checks pass correctly.
        if (!$manager_role->has_cap('can_assign_orders')) {
            $manager_role->add_cap('can_assign_orders');
            $updated = true;
        }
    }

    if ($updated && is_user_logged_in()) {
        $uid = (int) get_current_user_id();
        if ($uid > 0) {
            clean_user_cache($uid);
            wp_set_current_user($uid);
        }
    }
}

/**
 * Activation when loader / PHP / package layout blocks core: deactivate only this plugin (site keeps running).
 */
function wotm_activation_requirements_failed() {
    if (!function_exists('deactivate_plugins')) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }

    $env = wotm_environment_allows_core();
    $notice = 'unknown';
    if (empty($env['ok'])) {
        $notice = isset($env['reason']) ? (string) $env['reason'] : 'unknown';
    } elseif (defined('WOTM_CORE_LOAD_FAILED')) {
        // Preserve the *actual* failure code (no_license, validate_failed,
        // no_writable_tier, key_bootstrap, missing_core_file, ...) so the
        // admin notice can surface a useful, action-oriented message instead
        // of always blaming a "missing file".
        $notice = (string) WOTM_CORE_LOAD_FAILED;
    } elseif (!function_exists('wotm_on_activation')) {
        // Last resort: core never declared its activation hook AND no failure
        // code was recorded - most commonly a truly incomplete upload.
        $notice = 'missing_core_file';
    }

    // Only auto-deactivate for *unrecoverable* failures (loader missing, PHP
    // version unsupported, real missing file). For recoverable codes we keep
    // the plugin "active" so the plain-PHP Easy Order Manager fallback screen
    // is reachable - the customer can fix the issue from inside WordPress
    // instead of touching the database.
    if (!wotm_is_recoverable_failure_code($notice)) {
        deactivate_plugins(WOTM_PLUGIN_BASENAME, true);
    }

    set_transient('wotm_requirements_notice', $notice, 120);
}

/**
 * Non-fatal admin notice when the plugin is active in the database but core cannot load.
 */
function wotm_admin_notice_requirements_failed() {
    if (!current_user_can('activate_plugins') && !current_user_can('manage_options')) {
        return;
    }

    // One-shot success notice after the customer saved a license key from the
    // fallback Easy Order Manager form. Show it whether the encoded core has
    // loaded (success) or still cannot load (we'll continue below to surface
    // the remaining failure).
    if (get_transient('wotm_license_just_saved')) {
        delete_transient('wotm_license_just_saved');
        if (defined('WOTM_CORE_LOADED') && WOTM_CORE_LOADED) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('License saved. Easy Order Manager is ready to use.', 'woocommerce-easy-order-manager') . '</p></div>';
            return;
        }
        echo '<div class="notice notice-info is-dismissible"><p>' . esc_html__('License saved, but the plugin did not start. Try again or contact support.', 'woocommerce-easy-order-manager') . '</p></div>';
    }

    $msg = '';
    $flag = get_transient('wotm_requirements_notice');
    if ($flag === 'ioncube') {
        delete_transient('wotm_requirements_notice');
        $msg = sprintf(
            /* translators: %s: URL to setup instructions (YouTube). */
            __('This plugin needs ionCube Loader. <a href="%s">How to turn it on</a>', 'woocommerce-easy-order-manager'),
            esc_url(WOTM_IONCUBE_HELP_PLAYLIST_URL)
        );
    } elseif ($flag === 'loader_too_old') {
        delete_transient('wotm_requirements_notice');
        $msg = sprintf(
            /* translators: %s: URL to setup instructions (YouTube). */
            __('Update ionCube Loader to version 14.4 or newer, then activate the plugin again. <a href="%s">Help</a>', 'woocommerce-easy-order-manager'),
            esc_url(WOTM_IONCUBE_HELP_PLAYLIST_URL)
        );
    } elseif ($flag === 'php80') {
        delete_transient('wotm_requirements_notice');
        $msg = __('This plugin does not work on PHP 8.0. Use PHP 8.1 to 8.5.', 'woocommerce-easy-order-manager');
    } elseif ($flag === 'php_unsupported') {
        delete_transient('wotm_requirements_notice');
        $msg = sprintf(
            /* translators: %s: current PHP version */
            __('This plugin needs PHP 8.1–8.5. This site is on PHP %s.', 'woocommerce-easy-order-manager'),
            PHP_VERSION
        );
    } elseif ($flag === 'missing_core_file') {
        delete_transient('wotm_requirements_notice');
        $msg = __('A plugin file is missing. Upload the plugin again or contact support.', 'woocommerce-easy-order-manager');
    } elseif ($flag === 'encoded_file_corrupt') {
        delete_transient('wotm_requirements_notice');
        $msg = __('The plugin files look incomplete. Upload the plugin again or contact support.', 'woocommerce-easy-order-manager');
    } elseif ($flag === 'key_impl_missing') {
        delete_transient('wotm_requirements_notice');
        $msg = __('A file is missing or ionCube is off. Upload the plugin again or contact support.', 'woocommerce-easy-order-manager');
    } elseif ($flag === 'key_bootstrap') {
        delete_transient('wotm_requirements_notice');
        $msg = wotm_render_bootstrap_failure_notice();
    } elseif ($flag === 'unknown') {
        delete_transient('wotm_requirements_notice');
        $msg = sprintf(
            /* translators: %s: URL to setup instructions (YouTube). */
            __('The plugin could not finish starting. Check PHP version, ionCube, and that the upload finished. <a href="%s">Help with ionCube</a>', 'woocommerce-easy-order-manager'),
            esc_url(WOTM_IONCUBE_HELP_PLAYLIST_URL)
        );
    } elseif (is_string($flag) && $flag !== '' && $flag !== false) {
        // Any other transient code (no_license, validate_failed,
        // no_writable_tier, key_bootstrap, ...) → render the dedicated
        // bootstrap-failure notice for that code.
        delete_transient('wotm_requirements_notice');
        if (function_exists('wotm_render_bootstrap_failure_notice')) {
            $msg = wotm_render_bootstrap_failure_notice($flag);
        }
    }
    if ($msg === '' && !extension_loaded('ionCube Loader')) {
        $msg = sprintf(
            /* translators: 1: plugin name HTML, 2: URL to setup instructions (YouTube). */
            __('%1$s cannot load. Turn on ionCube Loader. <a href="%2$s">Help</a>', 'woocommerce-easy-order-manager'),
            '<strong>Easy Order Manager</strong>',
            esc_url(WOTM_IONCUBE_HELP_PLAYLIST_URL)
        );
    }
    if ($msg === '') {
        $env = wotm_environment_allows_core();
        if ($env['reason'] === 'php80') {
            $msg = __('This plugin does not work on PHP 8.0. Use PHP 8.1 to 8.5.', 'woocommerce-easy-order-manager');
        } elseif (!$env['ok']) {
            $msg = sprintf(
                /* translators: %s: current PHP version */
                __('This plugin needs PHP 8.1–8.5. This site is on PHP %s.', 'woocommerce-easy-order-manager'),
                PHP_VERSION
            );
        }
    }
    if ($msg === '' && defined('WOTM_CORE_LOAD_FAILED') && WOTM_CORE_LOAD_FAILED === 'missing_core_file') {
        $msg = __('A plugin file is missing. Upload the plugin again or contact support.', 'woocommerce-easy-order-manager');
    }
    if ($msg === '' && defined('WOTM_CORE_LOAD_FAILED') && WOTM_CORE_LOAD_FAILED === 'encoded_file_corrupt') {
        $msg = __('The plugin files look incomplete. Upload the plugin again or contact support.', 'woocommerce-easy-order-manager');
    }
    if ($msg === '' && defined('WOTM_CORE_LOAD_FAILED') && WOTM_CORE_LOAD_FAILED === 'key_impl_missing') {
        $msg = __('A file is missing or ionCube is off. Upload the plugin again or contact support.', 'woocommerce-easy-order-manager');
    }
    /*
     * Catch-all for any specific bootstrap-failure code that wotm_record_failure()
     * stored - so 'no_license', 'validate_failed', 'domain_mismatch', etc. all
     * surface a helpful notice instead of falling through silently.
     */
    if ($msg === '' && defined('WOTM_CORE_LOAD_FAILED')) {
        $code = (string) WOTM_CORE_LOAD_FAILED;
        if ($code !== '' && $code !== 'missing_core_file' && $code !== 'encoded_file_corrupt' && $code !== 'key_impl_missing' && $code !== 'ioncube' && $code !== 'loader_too_old' && $code !== 'php80' && $code !== 'php_unsupported') {
            $msg = wotm_render_bootstrap_failure_notice($code);
        }
    }
    if ($msg === '') {
        return;
    }
    // License entry (fallback menu) already shows this status; avoid duplicate notices.
    if (isset($_GET['page']) && sanitize_key((string) $_GET['page']) === 'easy-order-manager') {
        return;
    }
    echo '<div class="notice notice-error"><p>' . wp_kses_post($msg) . '</p></div>';
}

/**
 * Render an actionable admin-notice message for a bootstrap failure code.
 * Falls back to the persisted wotm_last_failure_code option when no code is passed.
 *
 * @param string $code Optional. Specific failure code; otherwise resolved from option.
 * @param bool   $on_license_page When true, copy is tailored for the Easy Order Manager
 *                fallback screen (no "go to EOM" link - user is already there).
 * @return string Translated HTML message ready for wp_kses_post().
 */
function wotm_render_bootstrap_failure_notice($code = '', $on_license_page = false) {
    if ($code === '' && function_exists('get_option')) {
        $code = (string) get_option('wotm_last_failure_code', '');
    }
    $code = (string) $code;

    // First admin hit often consumes transient `no_license`; the next request may only
    // have the loader's generic `key_bootstrap` (or an empty persisted code) even when
    // the fix is still "enter a license key" - use the same copy as `no_license`.
    if (function_exists('get_option') && trim((string) get_option('otm_license_key', '')) === ''
        && ($code === 'key_bootstrap' || $code === '')) {
        $code = 'no_license';
    }

    switch ($code) {
        case 'no_license':
            if ($on_license_page) {
                $msg = esc_html__('Enter your license key below, then click Save.', 'woocommerce-easy-order-manager');
            } else {
                $eom_url = function_exists('admin_url') ? admin_url('admin.php?page=easy-order-manager') : '';
                $msg = esc_html__('Activate your license in', 'woocommerce-easy-order-manager')
                    . ' <a href="' . esc_url($eom_url) . '">' . esc_html__('Easy Order Manager', 'woocommerce-easy-order-manager') . '</a>.';
            }
            break;
        case 'validate_failed':
            $detail = wotm_decode_last_failure_detail();
            $http   = isset($detail['http']) ? (int) $detail['http'] : 0;
            $err    = isset($detail['http_err']) ? strtolower((string) $detail['http_err']) : '';
            $hmsg   = isset($detail['http_msg']) ? (string) $detail['http_msg'] : '';

            if ($http === 429 || strpos($hmsg, 'rate') !== false || strpos($hmsg, 'too many') !== false) {
                $msg = __('Too many license checks were sent from this server. Wait 2-5 minutes, then try again.', 'woocommerce-easy-order-manager');
            } elseif ($http >= 500) {
                $msg = __('License server is temporarily busy. Wait a bit and try again.', 'woocommerce-easy-order-manager');
            } elseif (strpos($hmsg, 'timed out') !== false || strpos($err, 'timeout') !== false || strpos($err, 'timed_out') !== false) {
                $msg = __('Could not reach the license server in time. This hosting server may be blocking or delaying outgoing HTTPS requests.', 'woocommerce-easy-order-manager');
            } elseif (strpos($hmsg, 'ssl') !== false || strpos($hmsg, 'certificate') !== false || strpos($err, 'ssl') !== false) {
                $msg = __('Secure connection to the license server failed (SSL/certificate). Ask your host to fix OpenSSL/CA certificates.', 'woocommerce-easy-order-manager');
            } elseif (strpos($hmsg, 'resolve host') !== false || strpos($hmsg, 'could not resolve') !== false || strpos($hmsg, 'name lookup') !== false || strpos($err, 'dns') !== false) {
                $msg = __('This server cannot resolve the license domain (DNS issue). Ask your host to fix DNS resolver/network routing.', 'woocommerce-easy-order-manager');
            } else {
                $msg = __('We could not check your license. Check your internet and try again, or contact support.', 'woocommerce-easy-order-manager');
            }
            break;
        case 'external_key_http_failed':
        case 'dynamic_key_http_failed':
            $msg = __('We could not check your license. Check your internet and try again, or contact support.', 'woocommerce-easy-order-manager');
            break;
        case 'domain_mismatch':
            $msg = __('This license is not for this website. Contact support.', 'woocommerce-easy-order-manager');
            break;
        case 'license_expired':
        case 'license_revoked':
        case 'license_inactive':
            $msg = __('Your license is not active or has expired. Please <a href="https://easyordermanager.com.bd/top-up/" target="_blank" style="text-decoration:underline;">click here to renew</a>.', 'woocommerce-easy-order-manager');
            break;
        case 'no_writable_tier':
        case 'mkdir_failed':
        case 'tmp_write_failed':
        case 'atomic_rename_failed':
            $msg = __('The site could not save the license file. Ask your host to allow writing to the uploads folder.', 'woocommerce-easy-order-manager');
            break;
        case 'ini_set_blocked':
        case 'ini_set_disabled':
            // v1.10 dropped the ini_set() codepath entirely (file-mode external
            // key per Guide §4.2.1 - the Loader reads the key file directly,
            // no PHP directive registration needed). This case is kept only
            // for forward-compat with stale option rows on upgraded sites.
            $msg = __('Install the latest plugin files again, or contact support.', 'woocommerce-easy-order-manager');
            break;
        case 'hmac_failed':
        case 'hmac_nonce_mismatch':
        case 'payload_sha_mismatch':
        case 'base64_decode_failed':
            $msg = __('License check failed. Turn the plugin off and on again, or contact support.', 'woocommerce-easy-order-manager');
            break;
        case 'hmac_freshness_fail':
            // The ONLY truly clock-skew sensitive code. Keep the NTP wording
            // here and stop falsely blaming clock-skew for 404 / HTTP errors.
            $msg = __('The server clock may be wrong. Ask your host to fix the time, then try again.', 'woocommerce-easy-order-manager');
            break;
        case 'external_key_response_invalid':
        case 'dynamic_key_response_invalid':
            $detail = wotm_decode_last_failure_detail();
            $http   = isset($detail['http']) ? (int) $detail['http'] : 0;
            $srv    = isset($detail['srv_err']) ? (string) $detail['srv_err'] : '';
            if ($srv === 'revision_unknown' || $http === 404) {
                $msg = __('This version could not be verified. Install the latest plugin or contact support.', 'woocommerce-easy-order-manager');
            } elseif ($srv === 'decrypt_failed' || $http >= 500) {
                $msg = __('A server error happened. Wait a bit and try again, or contact support.', 'woocommerce-easy-order-manager');
            } elseif ($srv === 'rate_limited' || $http === 429) {
                $msg = __('Too many tries. Wait a few minutes and try again.', 'woocommerce-easy-order-manager');
            } elseif ($srv === 'site_secret_missing' || $http === 409) {
                $msg = __('Please turn the plugin off, then turn it on again.', 'woocommerce-easy-order-manager');
            } elseif ($http >= 400 && $http < 500) {
                $msg = __('The license was not accepted. Check the key or contact support.', 'woocommerce-easy-order-manager');
            } else {
                $msg = __('License check failed. Try turning the plugin off and on, or contact support.', 'woocommerce-easy-order-manager');
            }
            break;
        case 'key_revision_mismatch':
        case 'build_revision_missing':
            $msg = __('Your plugin files and license do not match. Install the latest version or contact support.', 'woocommerce-easy-order-manager');
            break;
        case 'validate_busy':
            $msg = __('Still checking the license. Refresh this page in a few seconds.', 'woocommerce-easy-order-manager');
            break;
        case 'bootstrap_exception':
            $msg = __('Something went wrong. Contact support.', 'woocommerce-easy-order-manager');
            break;
        case 'key_bootstrap':
        case '':
        default:
            $msg = __('The plugin could not start. Check your license key or contact support.', 'woocommerce-easy-order-manager');
            break;
    }

    return $msg;
}

/**
 * Returns the most recent failure-diagnostic payload as an associative array,
 * or [] when nothing is stored / decode fails. Used by the admin-notice
 * renderer to differentiate between revision_unknown / 5xx / generic failure
 * codes when the umbrella code is `external_key_response_invalid`.
 */
function wotm_decode_last_failure_detail() {
    if (!function_exists('get_transient')) {
        return [];
    }
    $blob = (string) get_transient('wotm_last_failure_blob');
    if ($blob === '') {
        return [];
    }
    $json = base64_decode($blob, true);
    if ($json === false || $json === '') {
        return [];
    }
    $arr = json_decode($json, true);
    return is_array($arr) ? $arr : [];
}

/**
 * Register the unencoded fallback Easy Order Manager screen when (a) the encoded core
 * could not load, and (b) the failure is recoverable from wp-admin. Uses slug
 * `easy-order-manager` so notices and links stay a single URL.
 */
function wotm_register_license_setup_menu() {
    if (!defined('WOTM_CORE_LOAD_FAILED')) {
        return;
    }
    $code = (string) WOTM_CORE_LOAD_FAILED;
    if (!wotm_is_recoverable_failure_code($code)) {
        return;
    }
    // Same slug as the full plugin admin screen so bookmarks / notices always use
    // admin.php?page=easy-order-manager (plain-PHP fallback only registers when core did not load).
    add_menu_page(
        __('WooCommerce Easy Order Manager', 'woocommerce-easy-order-manager'),
        __('Easy Order Manager', 'woocommerce-easy-order-manager'),
        'manage_options',
        'easy-order-manager',
        'wotm_render_license_setup_page',
        'dashicons-list-view',
        20
    );
}

/**
 * Render the fallback Easy Order Manager screen when the encoded core did not load:
 * failure context (if any) plus the license-key form. Submit redirects to plugins.php
 * so the next request re-runs bootstrap.
 */
function wotm_render_license_setup_page() {
    if (!current_user_can('manage_options')) {
        wp_die(esc_html__('You are not allowed to view this page.', 'woocommerce-easy-order-manager'));
    }

    $current_key = (string) get_option('otm_license_key', '');
    $code = defined('WOTM_CORE_LOAD_FAILED') ? (string) WOTM_CORE_LOAD_FAILED : '';

    $flash = isset($_GET['wotm_setup']) ? sanitize_key((string) $_GET['wotm_setup']) : '';

    echo '<div class="wrap">';
    echo '<h1>' . esc_html__('WooCommerce Easy Order Manager', 'woocommerce-easy-order-manager') . '</h1>';

    if ($flash === 'empty') {
        echo '<div class="notice notice-error is-dismissible"><p>' . esc_html__('Enter your license key.', 'woocommerce-easy-order-manager') . '</p></div>';
    }

    // Avoid stacking redundant "add a license key" copy: the form (and optional
    // flash) cover no_license and the loader's generic key_bootstrap when the key
    // is still empty - same as wotm_render_bootstrap_failure_notice() remap.
    $license_empty = !function_exists('get_option') ? true : (trim((string) get_option('otm_license_key', '')) === '');
    $needs_key_only = $license_empty && ($code === 'no_license' || $code === 'key_bootstrap' || $code === '');
    if ($code !== '' && !$needs_key_only && function_exists('wotm_render_bootstrap_failure_notice')) {
        echo '<div class="notice notice-warning" style="margin-top:18px;"><p>' . wp_kses_post(wotm_render_bootstrap_failure_notice($code, true)) . '</p></div>';
    }
    echo '<div style="background:#fff;padding:18px 22px;margin-top:18px;border:1px solid #ccd0d4;max-width:780px;">';
    echo '<h2>' . esc_html__('Your license key', 'woocommerce-easy-order-manager') . '</h2>';
    echo '<p>' . esc_html__('Paste the key you received, then click Save.', 'woocommerce-easy-order-manager') . '</p>';

    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('wotm_save_license_setup', 'wotm_setup_nonce');
    echo '<input type="hidden" name="action" value="wotm_save_license_setup">';
    echo '<table class="form-table" role="presentation"><tr>';
    echo '<th scope="row"><label for="wotm_license_key_input">' . esc_html__('License key', 'woocommerce-easy-order-manager') . '</label></th>';
    echo '<td><input type="text" id="wotm_license_key_input" name="wotm_license_key_input" value="' . esc_attr($current_key) . '" class="regular-text code" autocomplete="off" spellcheck="false" style="font-family:monospace;font-size:14px;letter-spacing:0.5px;"></td>';
    echo '</tr></table>';
    echo '<p><button type="submit" class="button button-primary button-large">' . esc_html__('Save license key', 'woocommerce-easy-order-manager') . '</button></p>';
    echo '</form>';
    echo '</div>';

    echo '<p style="margin-top:18px;color:#646970;">' . esc_html__('Need help? Contact support.', 'woocommerce-easy-order-manager') . '</p>';

    echo '</div>';
}

/**
 * Handle license-key submit from the fallback Easy Order Manager screen.
 * Saves the key and redirects to plugins.php so the next request re-runs bootstrap.
 */
function wotm_handle_license_setup_submit() {
    if (!current_user_can('manage_options')) {
        wp_die(esc_html__('You are not allowed to view this page.', 'woocommerce-easy-order-manager'));
    }
    check_admin_referer('wotm_save_license_setup', 'wotm_setup_nonce');

    $raw = isset($_POST['wotm_license_key_input']) ? (string) wp_unslash($_POST['wotm_license_key_input']) : '';
    $key = trim($raw);
    // Strict allowlist: license keys are alphanumeric + dashes / underscores.
    $key = preg_replace('/[^A-Za-z0-9_\-]/', '', $key);

    if ($key === '') {
        wp_safe_redirect(add_query_arg(['page' => 'easy-order-manager', 'wotm_setup' => 'empty'], admin_url('admin.php')));
        exit;
    }

    update_option('otm_license_key', $key, true);
    // Force a fresh /validate round-trip on next bootstrap by clearing the
    // cached site_secret tied to the old key (if any). Also reset the
    // stale failure markers so the next page load re-evaluates cleanly.
    delete_option('otm_site_secret');
    delete_option('wotm_last_failure_code');
    delete_option('wotm_key_failure_count');
    delete_transient('wotm_last_failure_blob');
    delete_transient('wotm_requirements_notice');

    // Stash a one-shot success flag for the next page load. The plugins
    // screen will show "license key accepted" on top if bootstrap now
    // succeeds, and the standard failure notice (with the next actionable
    // step) otherwise.
    set_transient('wotm_license_just_saved', 1, 30);

    // Always redirect to plugins.php - if the new key + key fetch succeed,
    // wp-admin will simply show the plugins list with the active plugin and
    // the success transient. If a *different* failure now blocks bootstrap
    // (ini_set_blocked, no_writable_tier, ...), the setup menu re-appears
    // with the new failure notice for the customer to act on.
    wp_safe_redirect(admin_url('plugins.php'));
    exit;
}

/**
 * Activation: best-effort warm-fetch of the external key so the very first
 * front-end hit after activation does not have to round-trip OTL. Wrapped in
 * try/catch - if OTL is unreachable we still want activation to succeed; the
 * normal request-time bootstrap will retry and eventually surface a notice.
 */
function wotm_activation_prewarm_keys() {
    if (!function_exists('wotm_prewarm_keys')) {
        return;
    }
    try {
        wotm_prewarm_keys();
    } catch (\Throwable $e) {
        // Swallow - activation must not abort on transient network errors.
        if (function_exists('error_log')) {
            @error_log('[WOTM] prewarm failed at activation: ' . $e->getMessage());
        }
    }
}

/**
 * Reset opcache when (de)activating so an opcache instance cannot serve a
 * stale encoded core after the operator uploads a new key revision. opcache
 * may not be loaded on every host - guard accordingly.
 */
function wotm_reset_opcache_safe() {
    if (function_exists('opcache_reset')) {
        @opcache_reset();
    }
}

/**
 * Automatically run activation hooks after a plugin update.
 *
 * Compares the stored DB version against the current codebase version.
 * When a newer version is detected (e.g. after a silent background update),
 * it re-runs the safe, idempotent parts of the activation routine so that
 * new DB tables, roles, and capabilities are provisioned without requiring
 * the admin to manually deactivate/reactivate.
 *
 * Intentionally EXCLUDES:
 *   - wotm_activation_prewarm_keys()  → makes a blocking HTTP call; must not run on init.
 *   - wotm_hardening_schedule_crons() → already self-heals on every wp_loaded automatically.
 *
 * Safe to run on init because every called function is idempotent:
 *   - wotm_on_activation() → calls wotm_create_page_on_activation() (checks before inserting),
 *     add_role() (no-op if exists), dbDelta() (safe ALTER/CREATE).
 *   - wotm_reset_opcache_safe() → simple wrapper around opcache_reset().
 */
function wotm_run_activation_on_update() {
    $installed_version = get_option( 'wotm_installed_version', '0.0.0' );

    // Only proceed when the codebase version is strictly newer than what is stored.
    if ( ! version_compare( $installed_version, WOTM_VERSION, '<' ) ) {
        return;
    }

    // 1. Run core activation: pages, roles, capabilities, and DB schema (dbDelta).
    //    wotm_on_activation() internally calls wotm_create_page_on_activation() which
    //    checks before inserting. add_role() silently no-ops if the role already exists.
    //    dbDelta() is idempotent.
    //    Note: DB schema migrations are also handled by otm_update_db_check() on
    //    plugins_loaded, so the DB part is redundant but still safe.
    if ( function_exists( 'wotm_on_activation' ) ) {
        wotm_on_activation();
    }

    // 2. Flush OPcache so the running PHP process picks up newly uploaded encoded files.
    //    Without this, a stale OPcache entry for an old encoded build can cause
    //    decryption failures until the cache expires naturally.
    if ( function_exists( 'wotm_reset_opcache_safe' ) ) {
        wotm_reset_opcache_safe();
    }

    // Persist the new version so this routine does not run again on the next request.
    update_option( 'wotm_installed_version', WOTM_VERSION );
}
