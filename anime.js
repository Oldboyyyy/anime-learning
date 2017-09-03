/**
 * http://anime-js.com
 * JavaScript animation engine
 * @version v2.0.2
 * @author Julian Garnier
 * @copyright ©2017 Julian Garnier
 * Released under the MIT license
**/

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.anime = factory();
  }
}(this, () => {

  // Defaults
  // 动画实例的默认参数
  const defaultInstanceSettings = {
    update: undefined, 
    begin: undefined,
    run: undefined,
    complete: undefined,
    loop: 1, // 动画循环次数，可以是数字或者布尔值
    direction: 'normal', // 相对于动画指定变的方向，'normal'正常, 'reverse'相反, 'alternate'轮流
    autoplay: true,
    offset: 0 // 定义时间轴上动画的开始时间， 类似值 '+=100' => 上次动画结束后100ms后开始
  }

  // 补间动画实例的默认参数
  const defaultTweenSettings = {
    duration: 1000, // 持续时间
    delay: 0,  // 延时
    easing: 'easeOutElastic',  // 缓动函数
    elasticity: 500, // 回弹
    round: 0 // 表示颜色
  }

  // 有效的过度样式  
  const validTransforms = ['translateX', 'translateY', 'translateZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'skewX', 'skewY'];
  let transformString;

  // Utils 工具方法

  /**
   * 判断目标字符串中是否包含要判断的字符串
   * @param {*} str 目标字符串
   * @param {*} text 要判断的字符串
   */  
  function stringContains(str, text) {
    return str.indexOf(text) > -1;
  }

  // 判断数据类型  
  const is = {
    arr: a => Array.isArray(a), // 数组
    obj: a => stringContains(Object.prototype.toString.call(a), 'Object'), // 对象的实例 __proto__ === Object.proptype 的对象
    svg: a => a instanceof SVGElement, // svg对象
    dom: a => a.nodeType || is.svg(a), // dom对象
    str: a => typeof a === 'string', // sting类型
    fnc: a => typeof a === 'function', // 函数
    und: a => typeof a === 'undefined', // undefined
    hex: a => /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(a), // hex格式的颜色
    rgb: a => /^rgb/.test(a), // rgb格式的颜色
    hsl: a => /^hsl/.test(a), // hsl格式颜色
    col: a => (is.hex(a) || is.rgb(a) || is.hsl(a)) // 是否是颜色字符串
  }

  // BezierEasing https://github.com/gre/bezier-easing
  /**
   * 贝塞尔曲线
   */
  const bezier = (() => {

    const kSplineTableSize = 11;
    const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

    function A (aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1 };
    function B (aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1 };
    function C (aA1)      { return 3.0 * aA1 };

    function calcBezier (aT, aA1, aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT };
    function getSlope (aT, aA1, aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1) };

    function binarySubdivide (aX, aA, aB, mX1, mX2) {
      let currentX, currentT, i = 0;
      do {
        currentT = aA + (aB - aA) / 2.0;
        currentX = calcBezier(currentT, mX1, mX2) - aX;
        if (currentX > 0.0) { aB = currentT } else { aA = currentT };
      } while (Math.abs(currentX) > 0.0000001 && ++i < 10);
      return currentT;
    }

    function newtonRaphsonIterate (aX, aGuessT, mX1, mX2) {
      for (let i = 0; i < 4; ++i) {
        const currentSlope = getSlope(aGuessT, mX1, mX2);
        if (currentSlope === 0.0) return aGuessT;
        const currentX = calcBezier(aGuessT, mX1, mX2) - aX;
        aGuessT -= currentX / currentSlope;
      }
      return aGuessT;
    }

    function bezier(mX1, mY1, mX2, mY2) {

      if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) return;
      let sampleValues = new Float32Array(kSplineTableSize);

      if (mX1 !== mY1 || mX2 !== mY2) {
        for (let i = 0; i < kSplineTableSize; ++i) {
          sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
        }
      }

      function getTForX(aX) {

        let intervalStart = 0.0;
        let currentSample = 1;
        const lastSample = kSplineTableSize - 1;

        for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
          intervalStart += kSampleStepSize;
        }

        --currentSample;

        const dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
        const guessForT = intervalStart + dist * kSampleStepSize;
        const initialSlope = getSlope(guessForT, mX1, mX2);

        if (initialSlope >= 0.001) {
          return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
        } else if (initialSlope === 0.0) {
          return guessForT;
        } else {
          return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
        }

      }

      return x => {
        if (mX1 === mY1 && mX2 === mY2) return x;
        if (x === 0) return 0;
        if (x === 1) return 1;
        return calcBezier(getTForX(x), mY1, mY2);
      }

    }

    return bezier;

  })();

  /**
   * 渐变效果
   */  
  const easings = (() => {

    const names = ['Quad', 'Cubic', 'Quart', 'Quint', 'Sine', 'Expo', 'Circ', 'Back', 'Elastic'];

    // Elastic easing adapted from jQueryUI http://api.jqueryui.com/easings/
    // 回弹效果
    function elastic(t, p) {
      return t === 0 || t === 1 ? t :
      -Math.pow(2, 10 * (t - 1)) * Math.sin((((t - 1) - (p / (Math.PI * 2.0) * Math.asin(1))) * (Math.PI * 2)) / p );
    }

    // Approximated Penner equations http://matthewlein.com/ceaser/
    // 各种缓动效果的参数
    const equations = {
      In: [
        [0.550, 0.085, 0.680, 0.530], /* InQuad */
        [0.550, 0.055, 0.675, 0.190], /* InCubic */
        [0.895, 0.030, 0.685, 0.220], /* InQuart */
        [0.755, 0.050, 0.855, 0.060], /* InQuint */
        [0.470, 0.000, 0.745, 0.715], /* InSine */
        [0.950, 0.050, 0.795, 0.035], /* InExpo */
        [0.600, 0.040, 0.980, 0.335], /* InCirc */
        [0.600, -0.280, 0.735, 0.045], /* InBack */
        elastic /* InElastic */
      ], Out: [
        [0.250, 0.460, 0.450, 0.940], /* OutQuad */
        [0.215, 0.610, 0.355, 1.000], /* OutCubic */
        [0.165, 0.840, 0.440, 1.000], /* OutQuart */
        [0.230, 1.000, 0.320, 1.000], /* OutQuint */
        [0.390, 0.575, 0.565, 1.000], /* OutSine */
        [0.190, 1.000, 0.220, 1.000], /* OutExpo */
        [0.075, 0.820, 0.165, 1.000], /* OutCirc */
        [0.175, 0.885, 0.320, 1.275], /* OutBack */
        (t, f) => 1 - elastic(1 - t, f) /* OutElastic */
      ], InOut: [
        [0.455, 0.030, 0.515, 0.955], /* InOutQuad */
        [0.645, 0.045, 0.355, 1.000], /* InOutCubic */
        [0.770, 0.000, 0.175, 1.000], /* InOutQuart */
        [0.860, 0.000, 0.070, 1.000], /* InOutQuint */
        [0.445, 0.050, 0.550, 0.950], /* InOutSine */
        [1.000, 0.000, 0.000, 1.000], /* InOutExpo */
        [0.785, 0.135, 0.150, 0.860], /* InOutCirc */
        [0.680, -0.550, 0.265, 1.550], /* InOutBack */
        (t, f) => t < .5 ? elastic(t * 2, f) / 2 : 1 - elastic(t * -2 + 2, f) / 2 /* InOutElastic */
      ]
    }
    // 各种缓动函数的对象集合
    let functions = {
      linear: bezier(0.250, 0.250, 0.750, 0.750)
    }
    // 将各种缓动函数push进集合
    for (let type in equations) {
      equations[type].forEach((f, i) => {
        functions['ease'+type+names[i]] = is.fnc(f) ? f : bezier.apply(this, f);
      });
    }

    return functions;

  })();

  // Strings
  // 将驼峰形式的字符串，转成连字符形式的字符串 'aaaBbbb' => 'aaa-bbb'
  function stringToHyphens(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  // 选择器函数  
  function selectString(str) {
    if (is.col(str)) return;
    try {
      let nodes = document.querySelectorAll(str);
      return nodes;
    } catch(e) {
      return;
    }
  }

  // Arrays
  // 返回数组的长度
  function arrayLength(arr) {
    return arr.length;
  }

  // 将多维数组变成一维数组 [1,[2,[3]]] => [1, 2, 3] 
  function flattenArray(arr) {
    return arr.reduce((a, b) => a.concat(is.arr(b) ? flattenArray(b) : b), []);
  }

  /**
   * 将类数组转成真正的数组
   * @param {*} o 可以使选择器，如果是选择器是返回节点对象的数组，如果是字符串返回包含该字符串的数组
   */  
  function toArray(o) {
    if (is.arr(o)) return o;
    if (is.str(o)) o = selectString(o) || o;
    if (o instanceof NodeList || o instanceof HTMLCollection) return [].slice.call(o);
    return [o];
  }

  // 数组是否包含该元素  
  function arrayContains(arr, val) {
    return arr.some(a => a === val);
  }

  // Objects
  // 判断对象本身是否有该属性
  function objectHas(obj, prop) {
    return obj.hasOwnProperty(prop);
  }

  // 浅复制对象  
  function cloneObject(o) {
    let clone = {};
    for (let p in o) clone[p] = o[p];
    return clone;
  }

  // 返回一个新对象，该对象具有o1所有的私有属性，如果o1和o2有相同的属性，用o2的属性覆盖o1 的属性
  // o1 = {a: 'a', b: 'b'} o2 = {a: 'c'} => o = {a: 'c', b: 'b'}
  function replaceObjectProps(o1, o2) {
    let o = cloneObject(o1);
    for (let p in o1) o[p] = objectHas(o2, p) ? o2[p] : o1[p];
    return o;
  }

  // 对象合并，返回一个新对象 ，新对象拥有o1所有的私有属性以及o2上有的o1上 没有的属性
  // o1 = {a: 'a', b: 'b'} o2 = {a: 'c', c: 'c'}  => o = {a: 'a', b: 'b', c: 'c'}
  function mergeObjects(o1, o2) {
    let o = cloneObject(o1);
    for (let p in o2) o[p] = is.und(o1[p]) ? o2[p] : o1[p];
    return o;
  }

  // Colors 颜色转换函数
  // hex => rgb #F8F8FF => rgb(248, 248, 255)
  function hexToRgb(hexValue) {
    const rgx = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const hex = hexValue.replace(rgx, (m, r, g, b) => r + r + g + g + b + b );
    const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    const r = parseInt(rgb[1], 16);
    const g = parseInt(rgb[2], 16);
    const b = parseInt(rgb[3], 16);
    return `rgb(${r},${g},${b})`;
  }

  // hsl => rgb hsl(211, 82%, 62%) => rgb(79, 156, 238) 
  function hslToRgb(hslValue) {
    const hsl = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(hslValue);
    const h = parseInt(hsl[1]) / 360;
    const s = parseInt(hsl[2]) / 100;
    const l = parseInt(hsl[3]) / 100;
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    let r, g, b;
    if (s == 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return `rgb(${r * 255},${g * 255},${b * 255})`;
  }
  
  // 方法的集合  
  function colorToRgb(val) {
    if (is.rgb(val)) return val;
    if (is.hex(val)) return hexToRgb(val);
    if (is.hsl(val)) return hslToRgb(val);
  }

  // Units
  // 返回的单位
  function getUnit(val) {
    const split = /([\+\-]?[0-9#\.]+)(%|px|pt|em|rem|in|cm|mm|ex|pc|vw|vh|deg|rad|turn)?/.exec(val);
    if (split) return split[2];
  }
  // 根据transform的属性名称返回不同的单位
  function getTransformUnit(propName) {
    if (stringContains(propName, 'translate')) return 'px';
    if (stringContains(propName, 'rotate') || stringContains(propName, 'skew')) return 'deg';
  }

  // Values
  // 将字符串转成浮点型的数值
  function parseFloatValue(val) {
    return parseFloat(val);
  }
    
  // 返回最小值到最大值之间的值，包括两个端点
  function minMaxValue(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  // 返回函数的返回值  
  function getFunctionValue(val, animatable) {
    if (!is.fnc(val)) return val;
    return val(animatable.target, animatable.id, animatable.total);
  }

  // 返回css样式对应的值  
  function getCSSValue(el, prop) {
    if (prop in el.style) {
      return getComputedStyle(el).getPropertyValue(stringToHyphens(prop)) || '0';
    }
  }

  // 返回那种类型的动画  
  function getAnimationType(el, prop) {
    if (is.dom(el) && arrayContains(validTransforms, prop)) return 'transform'; // transform类型
    if (is.dom(el) && (el.getAttribute(prop) || (is.svg(el) && el[prop]))) return 'attribute'; // 属性变化类型的
    if (is.dom(el) && (prop !== 'transform' && getCSSValue(el, prop))) return 'css'; // css样式类型的
    if (el[prop] != null) return 'object'; // 对象类型
  }

  // 获取transform类型的值  
  function getTransformValue(el, propName) {
    const defaultUnit = getTransformUnit(propName); // 获取transform的单位
    const defaultVal = stringContains(propName, 'scale') ? 1 : 0 + defaultUnit; // 判断求值的属性是不是scale，因为scale是没有单位的
    const str = el.style.transform;
    if (!str) return defaultVal; // 元素不存在transform样式，返回默认值 
    let match = [];
    let props = [];
    let values = [];
    const rgx = /(\w+)\((.+?)\)/g;
    while (match = rgx.exec(str)) { //exec方法会跟新lastIndex
      props.push(match[1]);
      values.push(match[2]);
    }
    const value = values.filter((val, i) => props[i] === propName ); // 过滤数据 
    return arrayLength(value) ? value[0] : defaultVal; // 返回过滤后的值，没有就返回默认值
  }

  //获取原始目标值  
  function getOriginalTargetValue(target, propName) {
    switch (getAnimationType(target, propName)) {
      case 'transform': return getTransformValue(target, propName);
      case 'css': return getCSSValue(target, propName);
      case 'attribute': return target.getAttribute(propName);
    }
    return target[propName] || 0;
  }

  // 返回相对的偏移量 
  /**
   * 做一次迭代
   * @param {*} to 类似 '*=5'
   * @param {*} from 是一个基础值
   */  
  function getRelativeValue(to, from) {
    const operator = /^(\*=|\+=|-=)/.exec(to); // 匹配运算符
    if (!operator) return to;
    const x = parseFloatValue(from);
    const y = parseFloatValue(to.replace(operator[0], ''));
    switch (operator[0][0]) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
    }
  }

  /**
   * 验证值是否有效，主要是验证单位的有效性
   * @param {*} val 值
   * @param {*} unit 单位
   */  
  function validateValue(val, unit) {
    if (is.col(val)) return colorToRgb(val); // 如果val是颜色值就统一返回rgb颜色
    const originalUnit = getUnit(val); // 获取单位
    const unitLess = originalUnit ? val.substr(0, arrayLength(val) - arrayLength(originalUnit)) : val;
    return unit ? unitLess + unit : unitLess;
  }

  // Motion path
  // 运动路径  

  // 判断该对象是不是一个有效的路径对象  
  function isPath(val) {
    return is.obj(val) && objectHas(val, 'totalLength');
  }

  // 返回svg元素的路径总长度
  function setDashoffset(el) {
    const pathLength = el.getTotalLength(); // 该方法svg2.0已经被移除，部分浏览器任然支持
    el.setAttribute('stroke-dasharray', pathLength);
    return pathLength;
  }

  // 获取路径，可以指定一部分的路径
  function getPath(path, percent) {
    const el = is.str(path) ? selectString(path)[0] : path;
    const p = percent || 100;
    return function (prop) {
      // 返回一个路径对象
      return {
        el: el,
        property: prop,
        totalLength: el.getTotalLength() * (p / 100)
      }
    }
  }

  /**
   * 返回一定距离的点或者是角度
   * @param {*} path 路径对象
   * @param {*} progress 比值
   */  
  function getPathProgress(path, progress) {
    function point(offset = 0) {
      const l = progress + offset >= 1 ? progress + offset : 0;
      return path.el.getPointAtLength(l); // 返回路径给定距离的点
    }
    const p = point();
    const p0 = point(-1);
    const p1 = point(+1);
    switch (path.property) {
      case 'x': return p.x;
      case 'y': return p.y;
      case 'angle': return Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
    }
  }

  // Decompose / recompose functions adapted from Animate Plus https://github.com/bendc/animateplus

  /**
   * 分解value
   * @param {*} val value
   * @param {*} unit 单位
   */  
  function decomposeValue(val, unit) {
    const rgx = /-?\d*\.?\d+/g;
    const value = validateValue((isPath(val) ? val.totalLength : val), unit) + '';
    return {
      original: value,
      numbers: value.match(rgx) ? value.match(rgx).map(Number) : [0],
      strings: value.split(rgx)
    }
  }

  // 重构参数
  function recomposeValue(numbers, strings) {
    return strings.reduce((a, b, i) => a + numbers[i - 1] + b);
  }

  // Animatables
  /**
   * 解析动画对象
   * @param {*} targets 元素选择器
   */  
  function parseTargets(targets) {
    const targetsArray = targets ? (flattenArray(is.arr(targets) ? targets.map(toArray) : toArray(targets))) : []; // 将传进来的动画挂载点转成数组
    return targetsArray.filter((item, pos, self) => self.indexOf(item) === pos); // 过滤掉无效的元素
  }

  /**
   * 获取补间动画数组
   * @param {*} targets 元素选择器
   * @return {[{target: 'div', id: 0, total: 1},{target: 'div', id: 1, total: 1}]} 返回类似这样的数组
   */  
  function getAnimatables(targets) {
    const parsed = parseTargets(targets); // 挂载点元素的数组
    return parsed.map((t, i) => {
      return {target: t, id: i, total: arrayLength(parsed)}; // 序列化成补间动画对象
    });
  }

  // Properties
  /**
   * 规范化补间动画的属性
   * @param {*} prop 外部传人的需要动画的属性属性
   * @param {*} tweenSettings 补间动画的默认属性
   */
  function normalizePropertyTweens(prop, tweenSettings) {
    let settings = cloneObject(tweenSettings); // 参数配置副本
    if (is.arr(prop)) { // 有可能是一个数组例如 translateX: [{ value: 100, duration: 1200 },{ value: 0, duration: 800 }]
      const l = arrayLength(prop);
      const isFromTo = (l === 2 && !is.obj(prop[0]));  // 判断是不是这种情况 translateX: [100, 200],
      if (!isFromTo) {
        // Duration divided by the number of tweens
        // 补间时间除以补间数
        if (!is.fnc(tweenSettings.duration)) settings.duration = tweenSettings.duration / l; // 如果本身是没有给补间动画设置duration，将将总的补间时间平分
      } else {
        // Transform [from, to] values shorthand to a valid tween value
        // 将[from，to]值转换为有效补间值的简写
        prop = {value: prop};
      }
    }
    return toArray(prop).map((v, i) => {
      // Default delay value should be applied only on the first tween
      // 延迟只会作用于第一个补间
      const delay = !i ? tweenSettings.delay : 0;
      // Use path object as a tween value
      // 使用路径对象作为补间值
      let obj = is.obj(v) && !isPath(v) ? v : {value: v};
      // Set default delay value
      // 设置默认延迟值
      if (is.und(obj.delay)) obj.delay = delay;
      return obj;
    }).map(k => mergeObjects(k, settings)); // 将传入的对象与默认值合并生成补间动画参数对象的数组，以传入的对象为主，合并自己身上没有的属性
  }

  /**
   * 返回属性数组
   * @param {*} instanceSettings 实例的属性
   * @param {*} tweenSettings 补间动画的属性
   * @param {*} params 外部传入的属性参数
   */  
  function getProperties(instanceSettings, tweenSettings, params) {
    let properties = [];
    const settings = mergeObjects(instanceSettings, tweenSettings); // 合并参数，得到一个新对象，新对象拥有instanceSettings所有属性以及tweenSettings上有的属性，instanceSettings上没有的属性
    for (let p in params) {
      // 传进来的params会包含三类的属性：1.动画挂载点 2.动画参数（持续时间，循环几次，缓动函数之类） 3.动画变化的参数（背景色，高度，宽度，旋转之类的）
      // setting中包含的属性，那就是动画参数，这里过滤掉了挂载点属性，剩下的就只剩下动画变参数，并将它们变成一个补间动画对象放在数组里面返回
      if (!objectHas(settings, p) && p !== 'targets') { 
        properties.push({
          name: p, // 标识符
          offset: settings['offset'], // 在时间线上的开始时间
          tweens: normalizePropertyTweens(params[p], tweenSettings) // 补间动画的集合
        });
      }
    }
    return properties;
  }

  // Tweens
 /**
  * 规范化关键帧动画的值
  * @param {*} tween 关键帧动画实例
  * @param {*} animatable 补间动画
  */
  function normalizeTweenValues(tween, animatable) {
    let t = {};
    for (let p in tween) {
      let value = getFunctionValue(tween[p], animatable);
      if (is.arr(value)) {
        value = value.map(v => getFunctionValue(v, animatable)); // 有些属性传入的是一个函数，取得函数的结果
        if (arrayLength(value) === 1) value = value[0];
      }
      t[p] = value;
    }
    t.duration = parseFloatValue(t.duration);
    t.delay = parseFloatValue(t.delay);
    return t;
  }

  // 规范化缓动函数  
  function normalizeEasing(val) {
    // 值为数组就是贝塞尔函数， 不是就直接执行easing函数
    return is.arr(val) ? bezier.apply(this, val) : easings[val];
  }

  // 规范化补间动画  
  function normalizeTweens(prop, animatable) {
    let previousTween;
    return prop.tweens.map(t => {
      let tween = normalizeTweenValues(t, animatable); // 规范化补间动画的参数
      const tweenValue = tween.value; // 缓存值
      const originalValue = getOriginalTargetValue(animatable.target, prop.name); // 获取对应的原始值
      const previousValue = previousTween ? previousTween.to.original : originalValue; 

      const from = is.arr(tweenValue) ? tweenValue[0] : previousValue; // from的值，动画的启示值
      const to = getRelativeValue(is.arr(tweenValue) ? tweenValue[1] : tweenValue, from); // to 动画的目标值  getRelativeValue会对*=5这样的参数进行计算
      const unit = getUnit(to) || getUnit(from) || getUnit(originalValue); // 单位

      tween.isPath = isPath(tweenValue); // svg的路径对象

      tween.from = decomposeValue(from, unit); // 拆分value为对象 '10px' {original: '10px',numbers: [10],strings: ['', 'px']
      tween.to = decomposeValue(to, unit);

      tween.start = previousTween ? previousTween.end : prop.offset; // 开始时间，如果没有上一个补间动画，就用offset的时间，否则就是上一个补间栋的结束时间
      tween.end = tween.start + tween.delay + tween.duration; // 补间的结束时间是开始时间+延迟时间+持续时间

      tween.easing = normalizeEasing(tween.easing); // 规范化缓动函数

      tween.elasticity = (1000 - minMaxValue(tween.elasticity, 1, 999)) / 1000; // 回弹

      if (is.col(tween.from.original)) tween.round = 1; // 表示颜色

      previousTween = tween; // 缓存这次的补间动画，用于下次使用
      return tween; // 返回补间动画对象
    });
  }

  // Tween progress

  const setTweenProgress = {
    css: (t, p, v) => t.style[p] = v,
    attribute: (t, p, v) => t.setAttribute(p, v),
    object: (t, p, v) => t[p] = v,
    transform: (t, p, v, transforms, id) => {
      if (!transforms[id]) transforms[id] = [];
      transforms[id].push(`${p}(${v})`);
    }
  }

  // Animations
  // 创建动画对象
  function createAnimation(animatable, prop) {
    const animType = getAnimationType(animatable.target, prop.name); // 动画的类型
    if (animType) {
      const tweens = normalizeTweens(prop, animatable); // 补间动画数组
      return {
        type: animType, // 动画类型 css，transform，svg，颜色，还是object
        property: prop.name, // 名称
        animatable: animatable, // 挂载点
        tweens: tweens, // 补间动画数组
        duration: tweens[arrayLength(tweens) - 1].end, // 补间时长，最后一个补间动画的结束时间
        delay: tweens[0].delay // 第一个补间动画的延迟，因为同步的时间线，整个动画的延迟只需要设置成第一个动画的延迟
      }
    }
  }

  /**
   * 返回动画对象的数组
   * @param {*} animatables 挂载点
   * @param {*} properties 动画参数
   */  
  function getAnimations(animatables, properties) {
    return flattenArray(animatables.map(animatable => {
      return properties.map(prop => {
        return createAnimation(animatable, prop);
      });
    })).filter(a => !is.und(a));
  }

  // Create Instance
/**
 * 收集时间
 * @param {*} type 可能是delay也有可能是 duration， delay；duration用数组中最大的值， delay用数组中最小的那个
 * @param {*} animations 动画对象数组
 * @param {*} tweenSettings 默认参数
 */
  function getInstanceTimings(type, animations, tweenSettings) {
    const math = (type === 'delay') ? Math.min : Math.max;
    return arrayLength(animations) ? math.apply(Math, animations.map(anim => anim[type])) : tweenSettings[type];
  }

  /**
   * 创建一个新的动画实例
   * @param {*} params 
   */  
  function createNewInstance(params) {
    const instanceSettings = replaceObjectProps(defaultInstanceSettings, params); // 用传进来的属性替换二者公有的属性
    const tweenSettings = replaceObjectProps(defaultTweenSettings, params);
    const animatables = getAnimatables(params.targets); // 获取到动画的挂载元素，并且得到规范化的补间动画的数组
    const properties = getProperties(instanceSettings, tweenSettings, params); // 补间动画参数数组
    const animations = getAnimations(animatables, properties); // 返回动画对象的数组
    return mergeObjects(instanceSettings, {
      children: [],
      animatables: animatables, // 挂载点结合
      animations: animations, // 动画对象集合
      duration: getInstanceTimings('duration', animations, tweenSettings),// 收集动画对象数组中时间最长的那个
      delay: getInstanceTimings('delay', animations, tweenSettings) // 收集动画对象数组中延迟最小的那个
    });
  }

  // Core

  let activeInstances = [];
  let raf = 0;

  const engine = (() => {
    function play() { raf = requestAnimationFrame(step); };
    function step(t) { // t是函数触发的时间戳
      const activeLength = arrayLength(activeInstances);
      if (activeLength) {
        let i = 0;
        while (i < activeLength) {
          if (activeInstances[i]) activeInstances[i].tick(t);
          i++;
        }
        play();
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }
    return play;
  })();


  // Public Instance

  function anime(params = {}) {

    let now, startTime, lastTime = 0; // now：进入tick的时间，可能是动画开始的时间也有可能是暂停重新开始的时间 startTime: 动画开始的时间 lastTime: 动画暂停的时间戳

    let resolve = null;

    // 拿到promise实例
    function makePromise() {
      return window.Promise && new Promise(_resolve => resolve = _resolve);
    }

    let promise = makePromise();

    let instance = createNewInstance(params); // 创建一个新的动画实例对象
    /**
     * 给实例对象挂载一个reset方法
     * 重置实例对象
     */
    instance.reset = function() {
      const direction = instance.direction; // 相对于动画指定变的方向，'normal'正常, 'reverse'相反, 'alternate'轮流
      const loops = instance.loop; // 动画循环次数，可以是数字或者布尔值，默认false
      instance.currentTime = 0; // 给实例创建一个当前时间的属性
      instance.progress = 0; // 进度
      instance.paused = true; // 暂停
      instance.began = false; // 开始
      instance.completed = false; // 动画完成
      instance.reversed = direction === 'reverse'; // 实在反向的标识符
      instance.remaining = direction === 'alternate' && loops === 1 ? 2 : loops; // 如果设置的动画的方向是相反，而loop却设置的是1，就会默认将其loop改成2，因为正向一次，反向一次
      for (let i = arrayLength(instance.children); i--; ){
        const child = instance.children[i];
        child.seek(child.offset); 
        child.reset();
      }
    }

    // 取反动画方向
    function toggleInstanceDirection() {
      instance.reversed = !instance.reversed;
    }

    // 调整时间 如果是要反向，其实一正一反才是一次动画，所正反的运动时间是总时间的一半
    function adjustTime(time) {
      return instance.reversed ? instance.duration - time : time;
    }

    function syncInstanceChildren(time) {
      const children = instance.children;
      if (time >= instance.currentTime) {
        for (let i = 0; i < arrayLength(children); i++) children[i].seek(time);
      } else {
        for (let i = arrayLength(children); i--;) children[i].seek(time);
      }
    }

    function setAnimationsProgress(insTime) {
      let i = 0;
      let transforms = {};
      const animations = instance.animations; // 动画对象
      while (i < arrayLength(animations)) {
        const anim = animations[i]; // 当前动画对象
        const animatable = anim.animatable; // 单前挂载对象
        const tweens = anim.tweens; // 单前补间动画
        const tween = tweens.filter(t => (insTime < t.end))[0] || tweens[arrayLength(tweens) - 1]; // 大于单前时间点的补间动画，没有的话就是最后一个补间动画
        const isPath = tween.isPath; // svg
        const round = tween.round; // 颜色
        const elapsed = minMaxValue(insTime - tween.start - tween.delay, 0, tween.duration) / tween.duration; // 已经用掉的时间和总时间的比值
        const eased = tween.easing(elapsed, tween.elasticity); // 通过缓动函数算出此时的值

        const progress = recomposeValue(tween.to.numbers.map((number, p) => {
          const start = isPath ? 0 : tween.from.numbers[p]; // svg的初始值的0， 不是的话就获取对象上的原始值
          let value = start + eased * (number - start); //此次补间动画要变化的值
          if (isPath) value = getPathProgress(tween.value, value); // 是svg就用svg的设置值的方法
          if (round) value = Math.round(value * round) / round; // 颜色的设置值的方法
          return value;
        }), tween.to.strings); // 重构参数值
        setTweenProgress[anim.type](animatable.target, anim.property, progress, transforms, animatable.id); // 根据不同的动画类型分别设置值
        anim.currentValue = progress; // 将当前的值记录下来
        i++;
      }
      if (transforms) { // 处理transform的动画值
        let id; for (id in transforms) {
          if (!transformString) {
            const t = 'transform';
            transformString = (getCSSValue(document.body, t) ? t : `-webkit-${t}`); // 加前缀
          }
          instance.animatables[id].target.style[transformString] = transforms[id].join(' ');
        }
      }
      instance.currentTime = insTime; // 记录当前时间
      instance.progress = (insTime / instance.duration) * 100; //时间 进度
    }

    function setCallback(cb) {
      if (instance[cb]) instance[cb](instance);
    }

    function countIteration() {
      if (instance.remaining && instance.remaining !== true) { //loop大于0去不是无限循环的情况下
        instance.remaining--;
      }
    }

    function setInstanceProgress(engineTime) {
      const insDuration = instance.duration; // 动画时长
      const insOffset = instance.offset; // 时间轴上的开始时间
      const insDelay = instance.delay; // 延迟
      const insCurrentTime = instance.currentTime; // 当前时间
      const insReversed = instance.reversed; // 是否是要相反返回的
      const insTime = minMaxValue(adjustTime(engineTime), 0, insDuration); // 动画当前时间，可定是在0和持续时间之间的值

      if (instance.children) syncInstanceChildren(insTime); //如果有子同步动画，则执行字同步动画

      if (insTime > insOffset && insTime < insDuration) { // 当前时间是在开始时间和结束时间之间的
        setAnimationsProgress(insTime); // 设置当前时间的进度
        if (!instance.began && insTime >= insDelay) { // 说明动画开始了
          instance.began = true; // 动画开始的标识符
          setCallback('begin'); // 派发begin事件
        }
        setCallback('run'); // 派发run事件
      } else {
        if (insTime <= insOffset && insCurrentTime !== 0) { // 相反方向运动
          setAnimationsProgress(0); // 反向将进度设成初始状态
          if (insReversed) countIteration();
        }
        if (insTime >= insDuration && insCurrentTime !== insDuration) { // alternate状态时候，一个时间段要拆成两段
          setAnimationsProgress(insDuration);
          if (!insReversed) countIteration();
        }
      }
      if (engineTime >= insDuration) {
        if (instance.remaining) { // 无限循环
          startTime = now;
          if (instance.direction === 'alternate') toggleInstanceDirection();
        } else {
          instance.pause(); //动画执行结束
          if ('Promise' in window) {
            resolve();
            promise = makePromise();
          }
          if (!instance.completed) {
            instance.completed = true; // 动画运行结束标识符
            setCallback('complete'); // 派发完成的事件
          }
        }
        lastTime = 0;
      }
      setCallback('update'); // 派发视图更新事件
    }

    instance.tick = function(t) {
      now = t; // 记录进入tick的时间时间戳
      if (!startTime) startTime = now; // 记录动画真正开始的时间，包括动画暂停，再次启动的时间
      const engineTime = (lastTime + now - startTime) * anime.speed; // 动画执行的当前时长
      setInstanceProgress(engineTime); // 设置动画实例的进度
    }

    instance.seek = function(time) {
      setInstanceProgress(adjustTime(time));
    }

    instance.pause = function() {
      const i = activeInstances.indexOf(instance);
      if (i > -1) activeInstances.splice(i, 1);
      instance.paused = true;
    }

    instance.play = function() {
      if (!instance.paused) return;
      instance.paused = false;
      startTime = 0;
      lastTime = adjustTime(instance.currentTime);
      activeInstances.push(instance); // 将此次动画实例推进全局的动画实例集合
      if (!raf) engine(); // 调用动画引擎
    }

    instance.reverse = function() {
      toggleInstanceDirection();
      startTime = 0;
      lastTime = adjustTime(instance.currentTime);
    }

    instance.restart = function() {
      instance.pause();
      instance.reset();
      instance.play();
    }

    instance.finished = promise;

    instance.reset();

    if (instance.autoplay) instance.play();

    return instance;

  }

  // Remove targets from animation

  function removeTargets(targets) {
    const targetsArray = parseTargets(targets);
    for (let i = arrayLength(activeInstances); i--;) {
      const instance = activeInstances[i];
      const animations = instance.animations;
      for (let a = arrayLength(animations); a--;) {
        if (arrayContains(targetsArray, animations[a].animatable.target)) {
          animations.splice(a, 1);
          if (!arrayLength(animations)) instance.pause();
        }
      }
    }
  }

  // Timeline

  function timeline(params) {
    let tl = anime(params);
    tl.pause();
    tl.duration = 0;
    tl.add = function(instancesParams) {
      tl.children.forEach( i => { i.began = true; i.completed = true; });
      toArray(instancesParams).forEach(insParams => {
        const tlDuration = tl.duration;
        const insOffset = insParams.offset;
        insParams.autoplay = false;
        insParams.offset = is.und(insOffset) ? tlDuration : getRelativeValue(insOffset, tlDuration);
        tl.seek(insParams.offset);
        const ins = anime(insParams);
        if (ins.duration > tlDuration) tl.duration = ins.duration;
        ins.began = true;
        tl.children.push(ins);
      });
      tl.reset();
      tl.seek(0);
      if (tl.autoplay) tl.restart();
      return tl;
    }
    return tl;
  }

  anime.version = '2.0.2';
  anime.speed = 1;
  anime.running = activeInstances;
  anime.remove = removeTargets;
  anime.getValue = getOriginalTargetValue;
  anime.path = getPath;
  anime.setDashoffset = setDashoffset;
  anime.bezier = bezier;
  anime.easings = easings;
  anime.timeline = timeline;
  anime.random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  return anime;

}));
