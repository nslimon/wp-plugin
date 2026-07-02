<?php
/**
 * WOTM Preflight helpers (PLAIN PHP - never encoded)
 *
 * Exposes two sanity-check functions used across the plugin to guard
 * `require_once` of files that might be protected bytecode. Both
 * helpers are deliberately tiny and dependency-free so they can run at the
 * very earliest point of the plugin lifecycle, before any other WOTM file
 * (plain or encoded) loads.
 *
 *   wotm_preflight_encoded_file($path)
 *     Strict: requires <?php header AND the encoded banner marker + size
 *     bounds. Used by core-loader.php for `includes/core/phpXX/*.php` which
 *     are ALWAYS shipped encoded.
 *
 *   wotm_preflight_php_file($path)
 *     Loose: requires <?php header + size bounds only. If the file's
 *     opening banner contains the encoded marker (meaning it is encoded
 *     bytecode), additionally demands that the loader extension
 *     is active. Used by the plain shims under `includes/` for the outer
 *     secure/*.php files which may be plain PHP during development and
 *     encoded bytecode in the shipped build.
 *
 * Both helpers are safe to call dozens of times per request: cost is one
 * filesize() + one 128-byte fread, all served from the OS page cache after
 * the first hit (measured < 0.05 ms on typical SSD hosts).
 *
 * Never call wp_die() here - the whole point is to keep the customer's
 * site alive even when a shipped file is missing or corrupt.
 *
 * @package woocommerce-easy-order-manager
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('wotm_preflight_encoded_file')) {
    /**
     * Strict preflight - the file must be encoded bytecode.
     *
     * @param string $path Absolute filesystem path.
     * @return bool true when the file looks safe to require_once.
     */
    function wotm_preflight_encoded_file($path) {
        $size = @filesize($path);
        if ($size === false || $size < 200 || $size > 52428800) {
            return false;
        }
        $fh = @fopen($path, 'rb');
        if ($fh === false) {
            return false;
        }
        $head = @fread($fh, 128);
        @fclose($fh);
        if (!is_string($head) || $head === '') {
            return false;
        }
        if (strncmp($head, '<?php', 5) !== 0) {
            return false;
        }
        // Strict variant: the encoded banner is required. A plain PHP
        // file placed here by accident would otherwise silently execute
        // as source code - we want to catch that as corruption.
        if (stripos($head, 'ioncube') === false) {
            return false;
        }
        return true;
    }
}

if (!function_exists('wotm_preflight_php_file')) {
    /**
     * Loose preflight - the file may be plain PHP or encoded. If
     * it looks encoded (banner contains marker) we additionally require
     * the loader extension to be active so that a `require_once` cannot
     * trigger a parse fatal on a server without the loader.
     *
     * @param string $path Absolute filesystem path.
     * @return bool true when the file looks safe to require_once.
     */
    function wotm_preflight_php_file($path) {
        $size = @filesize($path);
        if ($size === false || $size < 50 || $size > 52428800) {
            return false;
        }
        $fh = @fopen($path, 'rb');
        if ($fh === false) {
            return false;
        }
        $head = @fread($fh, 128);
        @fclose($fh);
        if (!is_string($head) || $head === '') {
            return false;
        }
        if (strncmp($head, '<?php', 5) !== 0) {
            return false;
        }
        if (stripos($head, 'ioncube') !== false && !extension_loaded('ionCube Loader')) {
            // Encoded bytecode on a server without Loader - require_once
            // would fatal with "The file ... has been encoded by the
            // protected encoder". Refuse here so the caller can fall back
            // to a plain-PHP no-op stub instead.
            return false;
        }
        return true;
    }
}
