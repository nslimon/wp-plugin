<?php
/**
 * WOTM uninstall - pure plain PHP cleanup of all key bootstrap artifacts.
 *
 * Implements §6.5.6 (mandatory in v1.8). MUST contain ZERO references to any
 * encoded function or class - at uninstall time the loader is not
 * invoked for this plugin, so anything that needs encoded core would fatal.
 *
 * Allowed dependencies: WordPress core APIs (get_option/delete_option, wp_remote_post,
 * wp_upload_dir, hash_hmac), and PHP built-ins (file_exists, unlink, rmdir).
 *
 * Whitelisted deletions per safety contract S10 - only options created by the
 * key-bootstrap layer:
 *   wotm_key_tier, wotm_key_dir, wotm_key_filename, wotm_key_hash,
 *   wotm_key_revision, wotm_key_failure_count, wotm_spine_last_seen,
 *   wotm_last_failure_code, otm_site_secret, otlm_wotm_schema_version (no - server-side only)
 *
 * NEVER deleted (customer's purchased data):
 *   otm_license_key, otm_credits_*, courier creds, fraud-checker config, any
 *   other pre-existing OTM/WOTM option that the plugin uses for normal data.
 *
 * @package woocommerce-easy-order-manager
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

/* -------------------------------------------------------------------------
 * Step 1 - best-effort POST to OTL /wotm-uninstall so the next reinstall has
 * a clean handshake. Failures are silently ignored: uninstall.php must NEVER
 * block on network I/O.
 * ----------------------------------------------------------------------- */

$license_key = (string) get_option('otm_license_key', '');
$site_secret = (string) get_option('otm_site_secret', '');
$domain      = '';
if (function_exists('site_url')) {
    $url = (string) site_url();
    $url = preg_replace('#^(https?://)?(www\.)?#i', '', $url);
    $domain = rtrim((string) $url, '/');
}

if ($license_key !== '' && $site_secret !== '' && $domain !== '' && function_exists('wp_remote_post')) {
    $nonce  = function_exists('wp_generate_password') ? wp_generate_password(32, false, false) : md5(uniqid('', true));
    $issued = time();
    $hmac = hash_hmac('sha256', implode('|', [
        $license_key,
        $domain,
        (string) $issued,
        $nonce,
    ]), $site_secret);

    $payload = [
        'license_key'      => $license_key,
        'domain'           => $domain,
        'plugin_slug'      => 'woocommerce-easy-order-manager',
        'nonce'            => $nonce,
        'issued_at_client' => $issued,
        'client_hmac'      => $hmac,
    ];
    @wp_remote_post(
        'https://easyordermanager.com.bd/wp-json/easy-order-license/v1/wotm-uninstall',
        [
            'method'      => 'POST',
            'timeout'     => 5,
            'redirection' => 0,
            'sslverify'   => true,
            'headers'     => [
                'Content-Type' => 'application/json; charset=utf-8',
                'Accept'       => 'application/json',
                'User-Agent'   => 'WOTM/uninstall',
            ],
            'body'        => function_exists('wp_json_encode') ? wp_json_encode($payload) : json_encode($payload),
        ]
    );
}

/* -------------------------------------------------------------------------
 * Step 2 - local file cleanup.
 *
 * v1.12 file-mode EXTERNAL key (Guide §4.2.1) lives at the FIXED path
 * <wp-content>/uploads/.ek/.ek (folder ".ek", file ".ek" - both leading
 * dots so cPanel / FTP clients hide them by default; ".ek" = "external
 * key" - distinct from the dynamic key which is in-memory only and never
 * written to disk). We unlink the key file + lock + the .htaccess /
 * index.php sentinels we wrote, then @rmdir the now-empty `.ek/` folder
 * (silently fails if the customer dropped any extra file in it).
 *
 * Legacy v1.10/1.11 plugin-internal locations (<plugin>/data/.ek,
 * <plugin>/data/ek.bin, plus the .htaccess / index.php sentinels and the
 * data/ folder itself) are also wiped so an install upgraded across the
 * v1.12 path migration leaves no stray key bytes inside the plugin tree.
 *
 * Even-older v1.9 random-tier paths (saved in the wotm_key_tier / _dir /
 * _filename option triple) are also cleaned up so an upgraded-then-deleted
 * install leaves no stray key bytes in /dev/shm or wp-content.
 * ----------------------------------------------------------------------- */

if (function_exists('plugin_dir_path')) {
    $plugin_dir = plugin_dir_path(__FILE__);
} else {
    $plugin_dir = rtrim(dirname(__FILE__), '/\\') . DIRECTORY_SEPARATOR;
}

// --- v1.12 current location: <wp-content>/uploads/.ek/.ek ---
$content_dir = '';
if (defined('WP_CONTENT_DIR') && WP_CONTENT_DIR !== '') {
    $content_dir = (string) WP_CONTENT_DIR;
} elseif (defined('ABSPATH') && ABSPATH !== '') {
    $content_dir = rtrim((string) ABSPATH, '/\\') . DIRECTORY_SEPARATOR . 'wp-content';
}
if ($content_dir !== '') {
    $key_dir   = rtrim($content_dir, '/\\') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . '.ek';
    $key_file  = $key_dir . DIRECTORY_SEPARATOR . '.ek';
    $lock_file = $key_dir . DIRECTORY_SEPARATOR . '.l';
    $ht_file   = $key_dir . DIRECTORY_SEPARATOR . '.htaccess';
    $idx_file  = $key_dir . DIRECTORY_SEPARATOR . 'index.php';
    foreach ([$key_file, $lock_file, $ht_file, $idx_file] as $f) {
        if (file_exists($f)) {
            @unlink($f);
        }
    }
    if (is_dir($key_dir)) {
        @rmdir($key_dir);
    }
}

// --- v1.10/1.11 legacy plugin-internal location: <plugin>/data/.ek ---
$legacy_data_dir = rtrim($plugin_dir, '/\\') . DIRECTORY_SEPARATOR . 'data';
$legacy_keyfile  = $legacy_data_dir . DIRECTORY_SEPARATOR . '.ek';     // v1.11
$legacy_keybin   = $legacy_data_dir . DIRECTORY_SEPARATOR . 'ek.bin';  // v1.10
$legacy_lock     = $legacy_data_dir . DIRECTORY_SEPARATOR . '.l';
$legacy_ht       = $legacy_data_dir . DIRECTORY_SEPARATOR . '.htaccess';
$legacy_idx      = $legacy_data_dir . DIRECTORY_SEPARATOR . 'index.php';
foreach ([$legacy_keyfile, $legacy_keybin, $legacy_lock, $legacy_ht, $legacy_idx] as $f) {
    if (file_exists($f)) {
        @unlink($f);
    }
}
if (is_dir($legacy_data_dir)) {
    @rmdir($legacy_data_dir);
}

// --- Legacy v1.9 random-tier cleanup (best effort, silent) ---
$tier     = (int)    get_option('wotm_key_tier', -1);
$dir      = (string) get_option('wotm_key_dir', '');
$filename = (string) get_option('wotm_key_filename', '');

if ($tier >= 0 && $dir !== '' && $filename !== '') {
    $base = '';
    switch ($tier) {
        case 0: $base = DIRECTORY_SEPARATOR === '/' ? '/dev/shm' : ''; break;
        case 1:
            $real = realpath(rtrim(ABSPATH, '/\\') . DIRECTORY_SEPARATOR . '..');
            $base = is_string($real) ? $real : '';
            break;
        case 2: $base = defined('WP_CONTENT_DIR') ? (string) WP_CONTENT_DIR : ''; break;
        case 3:
            if (function_exists('wp_upload_dir')) {
                $u = wp_upload_dir();
                $base = is_array($u) && !empty($u['basedir']) ? (string) $u['basedir'] : '';
            }
            break;
    }
    if ($base !== '') {
        $abs_dir  = rtrim($base, '/\\') . DIRECTORY_SEPARATOR . $dir;
        $abs_file = $abs_dir . DIRECTORY_SEPARATOR . $filename;
        $abs_lock = $abs_dir . DIRECTORY_SEPARATOR . '.l';
        if (file_exists($abs_file))  { @unlink($abs_file);  }
        if (file_exists($abs_lock))  { @unlink($abs_lock);  }
        if (is_dir($abs_dir))        { @rmdir($abs_dir);    }
    }
}

/* -------------------------------------------------------------------------
 * Step 3 - wp_options whitelist deletion. Only options this work created.
 * ----------------------------------------------------------------------- */

$whitelist = [
    'wotm_key_tier',
    'wotm_key_dir',
    'wotm_key_filename',
    'wotm_key_hash',
    'wotm_key_revision',
    'wotm_key_failure_count',
    'wotm_spine_last_seen',
    'wotm_last_failure_code',
    // v1.13 loader-state tracker - set by core-loader.php on every
    // loader-on request (throttled to 24h) so a future admin-notice
    // revision can differentiate "never had loader" vs "lost loader".
    'wotm_loader_last_seen',
    // Per §6.5.6: site_secret IS deleted because it is tied to license-handshake
    // state (server resets it via /wotm-uninstall above; client must drop its
    // copy in the same transaction).
    'otm_site_secret',
];
foreach ($whitelist as $opt) {
    delete_option($opt);
}

// Wildcard cleanup: LKG dynamic-literal cache is namespaced per build
// revision (wotm_dyn_literal_lkg_r{N}), so we cannot enumerate them in the
// static whitelist above. Delete every revision we ever wrote.
global $wpdb;
if (isset($wpdb) && is_object($wpdb)) {
    $wpdb->query(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE 'wotm_dyn_literal_lkg_r%'"
    );
}

/* -------------------------------------------------------------------------
 * Step 4 - clean up transients.
 * ----------------------------------------------------------------------- */

if (function_exists('delete_transient')) {
    delete_transient('wotm_last_failure_blob');
    // v1.13 health-cache transients - remove so a later reinstall starts
    // on a clean slate (stale "healthy" or "cooldown" flags from a prior
    // install would otherwise short-circuit the first bootstrap).
    delete_transient('wotm_key_health_ok');
    delete_transient('wotm_heal_cooldown');
    // Canary-anomaly transient from the hardening layer.
    delete_transient('wotm_canary_anomaly');
    // Activation-time notice transient.
    delete_transient('wotm_requirements_notice');
    delete_transient('wotm_license_just_saved');
}

/* -------------------------------------------------------------------------
 * Step 5 - Remove custom roles and admin capabilities.
 *
 * This is intentionally done here (uninstall) and NOT in deactivation.
 * Removing roles on deactivation would strip all Staff/Manager users of
 * their role, permanently locking them out on a simple toggle-off / update.
 * WordPress fires the deactivation hook BEFORE uninstall when "Delete" is
 * clicked, so wotm_on_deactivation() already ran (admin caps stripped there).
 * We repeat the admin-cap removal here for safety in case deactivation was
 * skipped (e.g. direct DB-level plugin deletion).
 * ----------------------------------------------------------------------- */

if (function_exists('remove_role')) {
    remove_role('easy_order_manager');
    remove_role('easy_order_staff');
}

if (function_exists('get_role')) {
    $admin_role = get_role('administrator');
    if ($admin_role) {
        $admin_role->remove_cap('manage_wotm_order_table');
        $admin_role->remove_cap('can_assign_orders');
    }
}

/*
 * Step 6 - invoke the encoded core's own deactivation cleanup IF it ever
 * loaded successfully. We deliberately do NOT do this - the encoded core
 * is not loaded at uninstall time, and the existing register_deactivation_hook
 * already runs at deactivate time. WordPress fires deactivate hooks BEFORE
 * uninstall when a user clicks "Delete plugin", so anything the encoded core
 * needed to clean up has already happened.
 */
