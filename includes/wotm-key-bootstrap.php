<?php
/**
 * WOTM Key Bootstrap (PLAIN SHIM - always plain PHP).
 *
 * As of v1.13 the HMAC/KDF formulas, OTL payload shape, and license-key
 * file handling moved into `includes/secure/key-impl.php` so they can be
 * shipped as protected bytecode (plain encryption, no external or
 * dynamic key). This shim keeps the historical public API alive and
 * handles graceful fallback when the encoded impl cannot be loaded:
 *
 *   - Constants that callers outside this file rely on (OTL URL, key path,
 *     plugin slug, HTTP tunables, cron event names referenced by the
 *     hardening hooks, legacy-path list used by uninstall.php) stay
 *     defined here in plain PHP so they exist even when the encoded impl
 *     never loads.
 *
 *   - After the constants, we preflight-check the encoded impl file and
 *     `require_once` it. Functions inside the impl use
 *     `!function_exists()` guards so subsequent no-op stubs defined below
 *     are harmless when the impl loaded fine.
 *
 *   - If the impl cannot be required (loader off, file missing, file
 *     corrupt) we fall back to no-op stubs. The public functions still
 *     exist with the expected names and signatures; they just return
 *     false / empty / sentinel values so the rest of the plugin degrades
 *     gracefully instead of fataling on undefined-function errors.
 *
 * Safety: this file MUST NOT call any function from another plugin or
 * from an encoded WOTM file at top-level - it runs during plugin load,
 * before plugins_loaded fires. Allowed deps at top-level: WP core
 * functions, PHP built-ins, the preflight helper (defined in
 * `includes/wotm-preflight.php`, loaded just before this shim).
 *
 * @package woocommerce-easy-order-manager
 */

if (!defined('ABSPATH')) {
    exit;
}

/* =========================================================================
 * Constants - must be defined in plain PHP so uninstall.php, the main
 * plugin file, and the hardening shim can reference them even when the
 * encoded impl is dormant.
 * ========================================================================= */

if (!defined('WOTM_OTL_BASE_URL')) {
    define('WOTM_OTL_BASE_URL', 'https://easyordermanager.com.bd/wp-json/easy-order-license/v1');
}
/*
 * v1.10/1.11/1.12 - File-mode EXTERNAL key (Guide §4.2.1).
 *
 * WOTM_KEY_RELATIVE_PATH MUST stay byte-identical to the encoder's
 * --encoding-key file:<runtime path>= argument for inner-core encoded
 * files. Bump WOTM_KEY_REVISION (in the main plugin file) whenever
 * changing it.
 */
if (!defined('WOTM_KEY_RELATIVE_PATH')) {
    define('WOTM_KEY_RELATIVE_PATH', 'uploads/.ek/.ek');
}
if (!defined('WOTM_KEY_RUNTIME_SUBDIR')) {
    define('WOTM_KEY_RUNTIME_SUBDIR', 'uploads/.ek');
}
if (!defined('WOTM_KEY_RUNTIME_FILENAME')) {
    define('WOTM_KEY_RUNTIME_FILENAME', '.ek');
}
if (!defined('WOTM_KEY_LEGACY_PLUGIN_PATHS')) {
    define('WOTM_KEY_LEGACY_PLUGIN_PATHS', 'data/.ek,data/ek.bin');
}
if (!defined('WOTM_KEY_LEGACY_PLUGIN_DIR')) {
    define('WOTM_KEY_LEGACY_PLUGIN_DIR', 'data');
}
/*
 * v1.13 - plan §7.1 guarantees "first broken-state worker: 3 sec slow max"
 * and §6 D1 specifies "one OTL fetch (3-sec timeout)" for the Check #2
 * self-heal path. The old defaults (8 sec × 3 attempts with exponential
 * sleep) could block a worker for up to ~27 sec during an OTL outage,
 * which violates that performance guarantee. A customer-site deployment
 * can still override these via `define()` in wp-config.php if they ship
 * on a genuinely high-latency network.
 */
if (!defined('WOTM_KEY_HTTP_TIMEOUT')) {
    define('WOTM_KEY_HTTP_TIMEOUT', 3);
}
if (!defined('WOTM_KEY_HTTP_CONNECT_TIMEOUT')) {
    define('WOTM_KEY_HTTP_CONNECT_TIMEOUT', 3);
}
if (!defined('WOTM_KEY_HTTP_MAX_ATTEMPTS')) {
    define('WOTM_KEY_HTTP_MAX_ATTEMPTS', 1);
}
if (!defined('WOTM_KEY_PLUGIN_SLUG')) {
    define('WOTM_KEY_PLUGIN_SLUG', 'woocommerce-easy-order-manager');
}

/* =========================================================================
 * Load the encoded implementation (no external/dynamic
 * key). The preflight helper is loaded by the main plugin file BEFORE
 * this shim so wotm_preflight_php_file() is guaranteed to exist here.
 * ========================================================================= */

$wotm_key_impl_path = __DIR__ . DIRECTORY_SEPARATOR . 'secure' . DIRECTORY_SEPARATOR . 'key-impl.php';
if (
    file_exists($wotm_key_impl_path)
    && function_exists('wotm_preflight_php_file')
    && wotm_preflight_php_file($wotm_key_impl_path)
) {
    require_once $wotm_key_impl_path;
}
unset($wotm_key_impl_path);

/* =========================================================================
 * Fallback no-op stubs. Each one is defined only when the encoded impl
 * did not already provide it (i.e. loader off, file missing, or
 * file corrupt). These stubs preserve the historical public API so
 * callers never hit "Call to undefined function" fatals - the plugin
 * just degrades to plugin-dormant + admin-notice state instead.
 * ========================================================================= */

if (!function_exists('wotm_bootstrap_keys_or_fail')) {
    function wotm_bootstrap_keys_or_fail() {
        // Record a specific reason so the admin notice can tell the
        // customer the encoded impl file is missing / corrupt vs the
        // generic "key bootstrap failed".
        if (function_exists('update_option')) {
            @update_option('wotm_last_failure_code', 'key_impl_missing', true);
        }
        if (!defined('WOTM_CORE_LOAD_FAILED')) {
            define('WOTM_CORE_LOAD_FAILED', 'key_impl_missing');
        }
        return false;
    }
}

if (!function_exists('wotm_check_key_health_and_heal')) {
    function wotm_check_key_health_and_heal() {
        return wotm_bootstrap_keys_or_fail();
    }
}

if (!function_exists('wotm_obtain_dynamic_key_string')) {
    /**
     * Sentinel fallback - 64 random hex chars. The inner-core spine files
     * are encoded with ext + dynamic keys, so without the real impl the
     * Loader will see a deterministic key mismatch and refuse to
     * decode - exactly what we want when the impl is missing (plugin
     * dormant, site alive).
     */
    function wotm_obtain_dynamic_key_string() {
        static $sentinel = null;
        if ($sentinel !== null) {
            return $sentinel;
        }
        try {
            $sentinel = bin2hex(random_bytes(32));
        } catch (\Throwable $e) {
            $sentinel = str_repeat('x', 64);
        }
        return $sentinel;
    }
}

if (!function_exists('wotm_prewarm_keys')) {
    function wotm_prewarm_keys() {
        // No-op. The activation prewarm flow (main plugin file) already
        // swallows throwables; a silent no-op here is the safest fallback.
    }
}

if (!function_exists('wotm_record_failure')) {
    function wotm_record_failure($code, $extra = []) {
        if (!defined('WOTM_CORE_LOAD_FAILED')) {
            define('WOTM_CORE_LOAD_FAILED', (string) $code);
        }
        if (function_exists('update_option')) {
            @update_option('wotm_last_failure_code', (string) $code, true);
        }
    }
}

if (!function_exists('wotm_get_failure_diagnostic')) {
    function wotm_get_failure_diagnostic($code = '', $extra = []) {
        $payload = [
            't'   => time(),
            'err' => (string) $code,
            'php' => PHP_VERSION,
            'note'=> 'impl_missing',
        ];
        $json = function_exists('wp_json_encode') ? wp_json_encode($payload) : json_encode($payload);
        return base64_encode((string) $json);
    }
}

if (!function_exists('wotm_get_current_key_absolute_path')) {
    /**
     * Plain fallback implementation - needed by the hardening shim's
     * license-rotation wipe path, which must still try to delete the
     * local key file even when the encoded impl is dormant. Mirrors the
     * resolver in key-impl.php exactly so the path stays consistent.
     */
    function wotm_get_current_key_absolute_path() {
        $base = '';
        if (defined('WP_CONTENT_DIR') && WP_CONTENT_DIR !== '') {
            $base = (string) WP_CONTENT_DIR;
        } elseif (defined('ABSPATH') && ABSPATH !== '') {
            $base = rtrim((string) ABSPATH, '/\\') . DIRECTORY_SEPARATOR . 'wp-content';
        }
        if ($base === '') {
            return '';
        }
        $sub  = defined('WOTM_KEY_RUNTIME_SUBDIR')   ? (string) WOTM_KEY_RUNTIME_SUBDIR   : 'uploads/.ek';
        $name = defined('WOTM_KEY_RUNTIME_FILENAME') ? (string) WOTM_KEY_RUNTIME_FILENAME : '.ek';
        $sub  = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $sub);
        return rtrim($base, '/\\') . DIRECTORY_SEPARATOR . $sub . DIRECTORY_SEPARATOR . $name;
    }
}

if (!function_exists('wotm_get_site_domain')) {
    /**
     * Plain fallback - used by the hardening shim's proactive-cron
     * callback. Mirrors the encoded impl byte-for-byte so HMAC-critical
     * domain formatting stays identical if the hardening impl is loaded
     * while the key impl is not (shouldn't happen in practice, but
     * defensive).
     */
    function wotm_get_site_domain() {
        $url = function_exists('site_url') ? (string) site_url() : '';
        if ($url === '') {
            $url = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : '';
        }
        $url = preg_replace('#^(https?://)?(www\.)?#i', '', $url);
        $url = rtrim((string) $url, '/');
        return $url;
    }
}
