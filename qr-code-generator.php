<?php
/**
 * Plugin Name: Realtime QR Code Generator
 * Description: Generates a QR code from user text input in real time, fully client-side. Dark mode only. Custom color pickers for foreground/background, transparent PNG, JPEG download. No data stored.
 * Version:     1.0.4
 * Author:      You
 * License:     GPL-2.0-or-later
 * Text Domain: rt-qr-generator
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'RT_QR_VERSION', '1.0.4' );
define( 'RT_QR_URL', plugin_dir_url( __FILE__ ) );
define( 'RT_QR_PATH', plugin_dir_path( __FILE__ ) );

function rt_qr_register_assets() {
	wp_register_script(
		'rt-qr-lib',
		RT_QR_URL . 'assets/js/qrcode.min.js',
		array(),
		'1.0.0',
		true
	);

	wp_register_script(
		'rt-qr-app',
		RT_QR_URL . 'assets/js/qr-script.js',
		array( 'rt-qr-lib' ),
		RT_QR_VERSION,
		true
	);

	wp_register_style(
		'rt-qr-style',
		RT_QR_URL . 'assets/css/qr-style.css',
		array(),
		RT_QR_VERSION
	);
}
add_action( 'wp_enqueue_scripts', 'rt_qr_register_assets' );

/**
 * Validate a HEX color (#RGB / #RRGGBB); return normalized #RRGGBB or fallback.
 */
function rt_qr_sanitize_hex( $value, $fallback ) {
	if ( ! is_string( $value ) ) {
		return $fallback;
	}
	$value = trim( $value );
	if ( '' === $value ) {
		return $fallback;
	}
	if ( $value[0] !== '#' ) {
		$value = '#' . $value;
	}
	if ( preg_match( '/^#([a-fA-F0-9]{3})$/', $value, $m ) ) {
		$c = $m[1];
		return '#' . strtoupper( $c[0] . $c[0] . $c[1] . $c[1] . $c[2] . $c[2] );
	}
	if ( preg_match( '/^#([a-fA-F0-9]{6})$/', $value, $m ) ) {
		return '#' . strtoupper( $m[1] );
	}
	return $fallback;
}

/**
 * Shortcode: [qr_code_generator placeholder="..." size="280" fg="#000000" bg="#FFFFFF" transparent="0"]
 */
function rt_qr_shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'placeholder' => 'Type any text or paste a link...',
			'size'        => 280,
			'fg'          => '#000000',
			'bg'          => '#FFFFFF',
			'transparent' => '0',
		),
		$atts,
		'qr_code_generator'
	);

	wp_enqueue_style( 'rt-qr-style' );
	wp_enqueue_script( 'rt-qr-lib' );
	wp_enqueue_script( 'rt-qr-app' );

	$size        = absint( $atts['size'] );
	$placeholder = esc_attr( $atts['placeholder'] );
	$fg          = rt_qr_sanitize_hex( $atts['fg'], '#000000' );
	$bg          = rt_qr_sanitize_hex( $atts['bg'], '#FFFFFF' );
	$transparent = in_array( (string) $atts['transparent'], array( '1', 'true', 'yes', 'on' ), true ) ? '1' : '0';

	$presets = array( '#000000', '#FFFFFF', '#1F232C', '#7C9CFF', '#E7EAF0', '#FF6B6B', '#27AE60', '#F2C94C' );

	ob_start();
	?>
	<div class="rt-qr-wrapper"
		data-size="<?php echo esc_attr( $size ); ?>"
		data-fg="<?php echo esc_attr( $fg ); ?>"
		data-bg="<?php echo esc_attr( $bg ); ?>"
		data-transparent="<?php echo esc_attr( $transparent ); ?>">
		<div class="rt-qr-card">
			<label for="rt-qr-input" class="rt-qr-label">Enter text or URL</label>
			<textarea
				id="rt-qr-input"
				class="rt-qr-input"
				rows="3"
				maxlength="1200"
				placeholder="<?php echo $placeholder; ?>"
				autocomplete="off"
				spellcheck="false"></textarea>
			<div class="rt-qr-meta">
				<span class="rt-qr-counter"><span class="rt-qr-count">0</span> / 1200</span>
				<span class="rt-qr-hint">Rendered locally &middot; nothing is uploaded</span>
			</div>

			<div class="rt-qr-colors">
				<div class="rt-qr-color-row">
					<span class="rt-qr-color-label">QR color</span>
					<button type="button" class="rt-qr-chip" data-role="fg" aria-label="Choose QR color">
						<span class="rt-qr-chip-swatch" style="background: <?php echo esc_attr( $fg ); ?>;"></span>
						<span class="rt-qr-chip-hex"><?php echo esc_html( $fg ); ?></span>
					</button>
				</div>
				<div class="rt-qr-color-row">
					<span class="rt-qr-color-label">Background</span>
					<button type="button" class="rt-qr-chip" data-role="bg" aria-label="Choose background color">
						<span class="rt-qr-chip-swatch" style="background: <?php echo esc_attr( $bg ); ?>;"></span>
						<span class="rt-qr-chip-hex"><?php echo esc_html( $bg ); ?></span>
					</button>
				</div>
				<label class="rt-qr-transparent">
					<input type="checkbox" class="rt-qr-transparent-input"<?php echo '1' === $transparent ? ' checked' : ''; ?> />
					<span>Transparent background (PNG only)</span>
				</label>

				<div class="rt-qr-presets" aria-label="Preset colors">
					<?php foreach ( $presets as $hex ) : ?>
						<button type="button" class="rt-qr-preset" data-color="<?php echo esc_attr( $hex ); ?>" style="background: <?php echo esc_attr( $hex ); ?>;" aria-label="Use <?php echo esc_attr( $hex ); ?>"></button>
					<?php endforeach; ?>
					<span class="rt-qr-presets-hint">click to apply to focused chip</span>
				</div>
			</div>

			<div class="rt-qr-canvas-area">
				<div id="rt-qr-canvas" class="rt-qr-canvas" aria-live="polite"></div>
				<p class="rt-qr-empty">Your QR code will appear here</p>
			</div>
			<p class="rt-qr-warning" role="status"></p>

			<div class="rt-qr-actions">
				<button type="button" class="rt-qr-btn rt-qr-download" data-format="png" disabled>Download PNG</button>
				<button type="button" class="rt-qr-btn rt-qr-download rt-qr-download-jpeg" data-format="jpeg" disabled>Download JPEG</button>
				<button type="button" class="rt-qr-btn rt-qr-clear" disabled>Clear</button>
			</div>
		</div>

		<!-- Color picker popover (single instance per wrapper, reused for fg/bg) -->
		<div class="rt-qr-picker" hidden>
			<div class="rt-qr-picker-sv" tabindex="0" aria-label="Saturation and value area">
				<div class="rt-qr-picker-sv-white"></div>
				<div class="rt-qr-picker-sv-black"></div>
				<div class="rt-qr-picker-sv-cursor"></div>
			</div>
			<div class="rt-qr-picker-hue">
				<input type="range" class="rt-qr-picker-hue-input" min="0" max="360" step="1" value="0" aria-label="Hue" />
			</div>
			<div class="rt-qr-picker-fields">
				<label class="rt-qr-picker-field rt-qr-picker-hex">
					<span>HEX</span>
					<input type="text" maxlength="7" spellcheck="false" autocomplete="off" />
				</label>
				<label class="rt-qr-picker-field rt-qr-picker-r">
					<span>R</span>
					<input type="number" min="0" max="255" step="1" />
				</label>
				<label class="rt-qr-picker-field rt-qr-picker-g">
					<span>G</span>
					<input type="number" min="0" max="255" step="1" />
				</label>
				<label class="rt-qr-picker-field rt-qr-picker-b">
					<span>B</span>
					<input type="number" min="0" max="255" step="1" />
				</label>
			</div>
			<div class="rt-qr-picker-footer">
				<button type="button" class="rt-qr-picker-close">Done</button>
			</div>
		</div>
	</div>
	<?php
	return ob_get_clean();
}
add_shortcode( 'qr_code_generator', 'rt_qr_shortcode' );
