'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();

var browserSync = require('browser-sync').create();
var buffer = require('vinyl-buffer');
var del = require('del');
var fs = require('fs');
var imageminPngquant = require('imagemin-pngquant');
var jade = require('jade');
var jstransformer = require('jstransformer');
var jstransformerStylus = require('jstransformer-stylus');
var path = require('path');
var posthtmlAttrsSorter = require('posthtml-attrs-sorter');
var runSequence = require('run-sequence');
var rupture = require('rupture');
var spritesmith = require('gulp.spritesmith');
var stylus = require('stylus');
var autoprefixer = require('autoprefixer');
var stylefmt = require('stylefmt');



// Error handler for gulp-plumber
var errorHandler = function (err) {
	$.util.log([(err.name + ' in ' + err.plugin).bold.red, '', err.message, ''].join('\n'));

	if ($.util.env.beep) {
		$.util.beep();
	}

	this.emit('end');
};

// Print object in console
var debugObj = function (obj) {
	var util = require('util');
	console.log(util.inspect(obj, {showHidden: false, depth: null}));
};

var correctNumber = function correctNumber(number) {
	return number < 10 ? '0' + number : number;
};

// Return timestamp
var getDateTime = function getDateTime() {
	var now = new Date();
	var year = now.getFullYear();
	var month = correctNumber(now.getMonth() + 1);
	var day = correctNumber(now.getDate());
	var hours = correctNumber(now.getHours());
	var minutes = correctNumber(now.getMinutes());
	return year + '-' + month + '-' + day + '-' + hours + minutes;
};

// https://github.com/stylus/stylus/issues/1872#issuecomment-86553717
var stylusFileExists = function() {
	return function(style) {
		style.define('file-exists', function(path) {
			return !!stylus.utils.lookup(path.string, this.paths);
		});
	};
};

// Plugins options
var options = {
	del: [
		'dest',
		'tmp'
	],

	plumber: {
		errorHandler: errorHandler
	},

	browserSync: {
		server: {
			baseDir: './dest'
		}
	},

	stylus: {
		use: [
			rupture(),
			stylusFileExists()
		],
		'include css': true
	},

	include: {
		hardFail: true,
		includePaths: [
			__dirname + "/",
			__dirname + "/node_modules",
			__dirname + "/source/static/scripts/plugins"
		]
	},

	jade: {
		jade: jade,
		pretty: '\t'
	},

	htmlPrettify: {
		'unformatted': ['pre', 'code', 'textarea'],
		'indent_with_tabs': true,
		'preserve_newlines': true,
		'brace_style': 'expand',
		'end_with_newline': true
	},

	svgSymbols: {
		title: false,
		id: '%f',
		className: '%f',
		svgClassname: 'icons-sprite',
		templates: [
			path.join(__dirname, 'source/static/styles/templates/icons-template.styl'),
			path.join(__dirname, 'source/static/styles/templates/icons-template.svg')
		]
	},

	spritesmith: {
		retinaSrcFilter: '**/*@2x.png',
		imgName: 'sprite.png',
		retinaImgName: 'sprite@2x.png',
		cssName: 'sprite.styl',
		algorithm: 'binary-tree',
		padding: 8,
		cssTemplate: './source/static/styles/templates/sprite-template.mustache'
	},

	imagemin: {
		optimizationLevel: 3,
		progressive: true,
		interlaced: true,
		svgoPlugins: [{removeViewBox: false}],
		use: [
			imageminPngquant()
		]
	},

	posthtml: {
		plugins: [
			posthtmlAttrsSorter({
				order: [
					'class',
					'id',
					'name',
					'data',
					'ng',
					'src',
					'for',
					'type',
					'href',
					'values',
					'title',
					'alt',
					'role',
					'aria'
				]
			})
		],
		options: {}
	},

	postcss: [
		autoprefixer({
			cascade: false
		}),
		stylefmt()
	]
};

gulp.task('cleanup', function (cb) {
	return del(options.del, cb);
});

gulp.task('browser-sync', function() {
	return browserSync.init(options.browserSync);
});

gulp.task('combine-modules-styles', function (cb) {
	return gulp.src(['**/*.styl', '!**/_*.styl'], {cwd: 'source/modules'})
		.pipe($.plumber(options.plumber))
		.pipe($.concat('modules.styl'))
		.pipe(gulp.dest('tmp'));
});

gulp.task('compile-styles', function (cb) {
	return gulp.src(['*.styl', '!_*.styl'], {cwd: 'source/static/styles'})
		.pipe($.plumber(options.plumber))
		.pipe($.stylus(options.stylus))
		.pipe($.combineMq({beautify: true}))
		.pipe($.postcss(options.postcss))
		.pipe(gulp.dest('dest/assets/stylesheets'))
		.pipe($.csso())
		.pipe($.rename({suffix: '.min'}))
		.pipe(gulp.dest('dest/assets/stylesheets'))
		.pipe(browserSync.stream());
});

gulp.task('compile-modules-yaml', function (cb) {
	return gulp.src(['**/*.yml', '!**/_*.yml'], {cwd: 'source/modules/*/data'})
		.pipe($.plumber(options.plumber))
		.pipe($.yaml({space: '\t'}))
		.pipe($.mergeJson('data-yaml.json'))
		.pipe(gulp.dest('tmp/data'));
});

gulp.task('combine-modules-json', function (cb) {
	return gulp.src(['**/*.json', '!**/_*.json'], {cwd: 'source/modules/*/data'})
		.pipe($.plumber(options.plumber))
		.pipe($.mergeJson('data-json.json'))
		.pipe(gulp.dest('tmp/data'));
});

gulp.task('combine-modules-data', function (cb) {
	return gulp.src('**/*.json', {cwd: 'tmp/data'})
		.pipe($.plumber(options.plumber))
		.pipe($.mergeJson('data.json'))
		.pipe(gulp.dest('tmp'));
});


jade.filters.stylus = jstransformer(jstransformerStylus);
jade.filters.shoutFilter = function (str) {
	return str + '!!!!';
}

gulp.task('compile-pages', function (cb) {
	var jsonData = JSON.parse(fs.readFileSync('./tmp/data.json'));
	options.jade.locals = jsonData;

	return gulp.src(['**/*.jade', '!**/_*.jade'], {cwd: 'source'})
		.pipe($.plumber(options.plumber))
		.pipe($.changed('dest', {extension: '.html'}))
		.pipe($.if(global.isWatching, $.cached('templates')))
		.pipe($.jadeInheritance({basedir: 'source'}))
		.pipe($.filter(function (file) {
			return !/source[\\\/]modules/.test(file.path);
		}))
		.pipe($.jade(options.jade))
		.pipe($.posthtml(options.posthtml.plugins, options.posthtml.options))
		.pipe($.prettify(options.htmlPrettify))
		.pipe($.flatten())
		.pipe(gulp.dest('dest'));
});

gulp.task('copy-modules-img', function (cb) {
	return gulp.src('**/*.{jpg,gif,svg,png}', {cwd: 'source/modules/*/assets'})
		.pipe($.plumber(options.plumber))
		.pipe($.changed('dest/assets/images'))
		.pipe($.imagemin(options.imagemin))
		.pipe($.flatten())
		.pipe(gulp.dest('dest/assets/images'));
});

gulp.task('combine-modules-scripts', function (cb) {
	return gulp.src(['*.js', '!_*.js'], {cwd: 'source/modules/*'})
		.pipe($.plumber(options.plumber))
		.pipe($.concat('modules.js', { newLine: '\n\n' }))
		.pipe(gulp.dest('tmp'));
});

gulp.task('copy-assets', function (cb) {
	var imageFilter = $.filter('**/*.{jpg,gif,svg,png}', {restore: true});
	var scriptsFilter = $.filter(['**/*.js', '!**/*.min.js'], {restore: true});
	var stylesFilter = $.filter(['**/*.css', '!**/*.min.css'], {restore: true});

	return gulp.src(['**/*.*', '!**/_*.*'], {cwd: 'source/static/assets'})
		.pipe($.plumber(options.plumber))
		.pipe($.changed('dest/assets'))

		// Minify images
		.pipe(imageFilter)
		.pipe($.changed('dest/assets'))
		.pipe($.imagemin(options.imagemin))
		.pipe(imageFilter.restore)

		// Minify JavaScript files
		.pipe(scriptsFilter)
		.pipe(gulp.dest('dest/assets'))
		.pipe($.uglify())
		.pipe($.rename({suffix: '.min'}))
		.pipe(scriptsFilter.restore)

		// Minify css
		.pipe(stylesFilter)
		.pipe($.csso())
		.pipe($.rename({suffix: '.min'}))
		.pipe(stylesFilter.restore)

		// Copy other files
		.pipe(gulp.dest('dest/assets'));
});

gulp.task('combine-scripts', function (cb) {
	return gulp.src(['*.js', '!_*.js'], {cwd: 'source/static/scripts'})
		.pipe($.plumber(options.plumber))
		.pipe($.include(options.include))
		.pipe(gulp.dest('dest/assets/javascripts'))
		.pipe($.uglify())
		.pipe($.rename({suffix: '.min'}))
		.pipe(gulp.dest('dest/assets/javascripts'));
});

gulp.task('combine-svg-icons', function (cb) {
	return gulp.src(['**/*.svg', '!**/_*.svg'], {cwd: 'source/static/icons'})
		.pipe($.plumber(options.plumber))
		.pipe($.imagemin(options.imagemin))
		.pipe($.svgSymbols(options.svgSymbols))
		.pipe($.if(/\.styl$/, gulp.dest('tmp')))
		.pipe($.if(/\.svg$/, $.rename('icons.svg')))
		.pipe($.if(/\.svg$/, gulp.dest('dest/assets/images')));
});

gulp.task('combine-png-sprite', function (cb) {
	var spriteData = gulp.src(['**/*.png', '!**/_*.png'], {cwd: 'source/static/sprite'})
		.pipe(spritesmith(options.spritesmith));

	spriteData.img.pipe(buffer())
		.pipe($.imagemin())
		.pipe(gulp.dest('dest/assets/images'));

	spriteData.css.pipe(buffer())
		.pipe(gulp.dest('tmp'));

	return spriteData.img.pipe(buffer());
});

// Semver
gulp.task('patch', function () {
	return gulp.src('package.json')
		.pipe($.bump())
		.pipe(gulp.dest('./'));
});

gulp.task('minor', function () {
	return gulp.src('package.json')
		.pipe($.bump({ type: 'minor' }))
		.pipe(gulp.dest('./'));
});

gulp.task('major', function () {
	return gulp.src('package.json')
		.pipe($.bump({ type: 'major' }))
		.pipe(gulp.dest('./'));
});

gulp.task('semver:reset', function () {
	return gulp.src('package.json')
		.pipe($.bump({ version: '0.1.0' }))
		.pipe(gulp.dest('./'));
});

gulp.task('build-zip', function() {
	var datetime = '-' + getDateTime();
	var zipName = 'dist' + datetime + '.zip';

	return gulp.src('dest/**/*')
		.pipe($.zip(zipName))
		.pipe(gulp.dest('zip'));
});

gulp.task('publish', function () {
	return gulp.src('**/*', {cwd: 'dest'})
		.pipe($.ghPages({branch: 'build'}))
});

// Service tasks

gulp.task('combine-data', function (cb) {
	return runSequence(
		[
			'compile-modules-yaml',
			'combine-modules-json'
		],
		'combine-modules-data',
		cb
	);
});

gulp.task('build-html', function (cb) {
	return runSequence(
		'combine-data',
		'compile-pages',
		cb
	);
});

gulp.task('build-css', function (cb) {
	return runSequence(
		'combine-modules-styles',
		'compile-styles',
		cb
	);
});

gulp.task('build-js', function (cb) {
	return runSequence(
		'combine-modules-scripts',
		'combine-scripts',
		cb
	);
});

// Main tasks
gulp.task('build', function (cb) {
	return runSequence(
		'cleanup',
		[
			'build-html',
			'combine-svg-icons',
			'combine-png-sprite',
			'copy-modules-img',
			'copy-assets',
			'build-js',
		],
		'build-css',
		cb
	);
});

gulp.task('zip', function (cb) {
	return runSequence(
		'build',
		'build-zip',
		cb
	);
});

gulp.task('deploy', function (cb) {
	return runSequence(
		'build',
		'publish',
		cb
	);
});

gulp.task('dev', function (cb) {
	return runSequence(
		'build',
		[
			'browser-sync',
			'watch'
		],
		cb
	);
});

gulp.task('watch', function (cb) {
	global.isWatching = true;

	// Modules, pages
	$.watch('source/**/*.jade', function() {
		return runSequence('compile-pages', browserSync.reload);
	});

	// Modules data
	$.watch(['source/modules/*/data/*.{json,yml}'], function() {
		delete $.cached.caches['templates'];
		return runSequence('build-html', browserSync.reload);
	});

	// Static styles
	$.watch('source/static/styles/**/*.styl', function() {
		// return runSequence('compile-styles');
		gulp.start('compile-styles');
	});

	// Modules styles
	$.watch('source/modules/**/*.styl', function() {
		// return runSequence('build-css');
		gulp.start('build-css');
	});

	// Static scripts
	$.watch('source/static/scripts/**/*.js', function() {
		return runSequence('combine-scripts', browserSync.reload);
	});

	// Modules scripts
	$.watch('source/modules/*/*.js', function() {
		return runSequence('build-js', browserSync.reload);
	});

	// Modules images
	$.watch('source/modules/*/assets/**/*.{jpg,gif,svg,png}', function() {
		return runSequence('copy-modules-img', browserSync.reload);
	});

	// Static files
	$.watch('source/static/assets/**/*', function() {
		return runSequence('copy-assets', browserSync.reload);
	});

	// Svg icons
	$.watch('source/static/icons/**/*.svg', function() {
		return runSequence('combine-svg-icons', 'build-css', browserSync.reload);
	});

	// Png sprites
	$.watch('source/static/sprite/**/*.png', function() {
		return runSequence('combine-png-sprite', browserSync.reload);
	});
});

gulp.task('default', function(cb) {
	gulp.start('build');
});
