<?php
/**
 * Template Name: Easy Order Manager Canvas
 *
 * This is the template that displays our order manager in a full-width, distraction-free canvas.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<?php wp_head(); ?>
	<style>
		/* Hide everything directly inside body except our wrapper, wpadminbar, and essential invisible tags */
		body > *:not(#wotm-canvas-wrapper):not(#wpadminbar):not(script):not(style):not(link):not(meta) {
			display: none !important;
		}
	</style>
</head>
<body <?php body_class(); ?>>
	<div id="wotm-canvas-wrapper" style="margin: 0px !important;">
	<?php
		while ( have_posts() ) :
			the_post();
			the_content();
		endwhile;
	?>
	</div>
	<?php wp_footer(); ?>
</body>
</html>
