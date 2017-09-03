const gulp = require('gulp')
const babel = require('gulp-babel')
const concat = require('gulp-concat')

gulp.task('default', () => {
  return gulp.src('./animejs/anime.js')
    .pipe(babel({
      presets: ["es2015"],
      plugins: ["transform-es2015-modules-umd"]
    }).on('error', err => (console.log(err))))
    .pipe(concat('anime-build.js'))
    .pipe(gulp.dest('./'))
})