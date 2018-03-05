(function () {
'use strict';

function app(state, actions, view, container) {
  var renderLock;
  var invokeLaterStack = [];
  var rootElement = (container && container.children[0]) || null;
  var lastNode = rootElement && toVNode(rootElement, [].map);
  var globalState = copy(state);
  var wiredActions = copy(actions);

  scheduleRender(wireStateToActions([], globalState, wiredActions));

  return wiredActions

  function toVNode(element, map) {
    return {
      name: element.nodeName.toLowerCase(),
      props: {},
      children: map.call(element.childNodes, function(element) {
        return element.nodeType === 3
          ? element.nodeValue
          : toVNode(element, map)
      })
    }
  }

  function render() {
    renderLock = !renderLock;

    var next = view(globalState, wiredActions);
    if (container && !renderLock) {
      rootElement = patch(container, rootElement, lastNode, (lastNode = next));
    }

    while ((next = invokeLaterStack.pop())) next();
  }

  function scheduleRender() {
    if (!renderLock) {
      renderLock = !renderLock;
      setTimeout(render);
    }
  }

  function copy(target, source) {
    var obj = {};

    for (var i in target) obj[i] = target[i];
    for (var i in source) obj[i] = source[i];

    return obj
  }

  function set(path, value, source) {
    var target = {};
    if (path.length) {
      target[path[0]] =
        path.length > 1 ? set(path.slice(1), value, source[path[0]]) : value;
      return copy(source, target)
    }
    return value
  }

  function get(path, source) {
    for (var i = 0; i < path.length; i++) {
      source = source[path[i]];
    }
    return source
  }

  function wireStateToActions(path, state, actions) {
    for (var key in actions) {
      typeof actions[key] === "function"
        ? (function(key, action) {
            actions[key] = function(data) {
              if (typeof (data = action(data)) === "function") {
                data = data(get(path, globalState), actions);
              }

              if (
                data &&
                data !== (state = get(path, globalState)) &&
                !data.then // Promise
              ) {
                scheduleRender(
                  (globalState = set(path, copy(state, data), globalState))
                );
              }

              return data
            };
          })(key, actions[key])
        : wireStateToActions(
            path.concat(key),
            (state[key] = state[key] || {}),
            (actions[key] = copy(actions[key]))
          );
    }
  }

  function getKey(node) {
    return node && node.props ? node.props.key : null
  }

  function setElementProp(element, name, value, isSVG, oldValue) {
    if (name === "key") {
    } else if (name === "style") {
      for (var i in copy(oldValue, value)) {
        element[name][i] = value == null || value[i] == null ? "" : value[i];
      }
    } else {
      if (typeof value === "function" || (name in element && !isSVG)) {
        element[name] = value == null ? "" : value;
      } else if (value != null && value !== false) {
        element.setAttribute(name, value);
      }

      if (value == null || value === false) {
        element.removeAttribute(name);
      }
    }
  }

  function createElement(node, isSVG) {
    var element =
      typeof node === "string" || typeof node === "number"
        ? document.createTextNode(node)
        : (isSVG = isSVG || node.name === "svg")
          ? document.createElementNS("http://www.w3.org/2000/svg", node.name)
          : document.createElement(node.name);

    if (node.props) {
      if (node.props.oncreate) {
        invokeLaterStack.push(function() {
          node.props.oncreate(element);
        });
      }

      for (var i = 0; i < node.children.length; i++) {
        element.appendChild(createElement(node.children[i], isSVG));
      }

      for (var name in node.props) {
        setElementProp(element, name, node.props[name], isSVG);
      }
    }

    return element
  }

  function updateElement(element, oldProps, props, isSVG) {
    for (var name in copy(oldProps, props)) {
      if (
        props[name] !==
        (name === "value" || name === "checked"
          ? element[name]
          : oldProps[name])
      ) {
        setElementProp(element, name, props[name], isSVG, oldProps[name]);
      }
    }

    if (props.onupdate) {
      invokeLaterStack.push(function() {
        props.onupdate(element, oldProps);
      });
    }
  }

  function removeChildren(element, node, props) {
    if ((props = node.props)) {
      for (var i = 0; i < node.children.length; i++) {
        removeChildren(element.childNodes[i], node.children[i]);
      }

      if (props.ondestroy) {
        props.ondestroy(element);
      }
    }
    return element
  }

  function removeElement(parent, element, node, cb) {
    function done() {
      parent.removeChild(removeChildren(element, node));
    }

    if (node.props && (cb = node.props.onremove)) {
      cb(element, done);
    } else {
      done();
    }
  }

  function patch(parent, element, oldNode, node, isSVG, nextSibling) {
    if (node === oldNode) {
    } else if (oldNode == null) {
      element = parent.insertBefore(createElement(node, isSVG), element);
    } else if (node.name && node.name === oldNode.name) {
      updateElement(
        element,
        oldNode.props,
        node.props,
        (isSVG = isSVG || node.name === "svg")
      );

      var oldElements = [];
      var oldKeyed = {};
      var newKeyed = {};

      for (var i = 0; i < oldNode.children.length; i++) {
        oldElements[i] = element.childNodes[i];

        var oldChild = oldNode.children[i];
        var oldKey = getKey(oldChild);

        if (null != oldKey) {
          oldKeyed[oldKey] = [oldElements[i], oldChild];
        }
      }

      var i = 0;
      var j = 0;

      while (j < node.children.length) {
        var oldChild = oldNode.children[i];
        var newChild = node.children[j];

        var oldKey = getKey(oldChild);
        var newKey = getKey(newChild);

        if (newKeyed[oldKey]) {
          i++;
          continue
        }

        if (newKey == null) {
          if (oldKey == null) {
            patch(element, oldElements[i], oldChild, newChild, isSVG);
            j++;
          }
          i++;
        } else {
          var recyledNode = oldKeyed[newKey] || [];

          if (oldKey === newKey) {
            patch(element, recyledNode[0], recyledNode[1], newChild, isSVG);
            i++;
          } else if (recyledNode[0]) {
            patch(
              element,
              element.insertBefore(recyledNode[0], oldElements[i]),
              recyledNode[1],
              newChild,
              isSVG
            );
          } else {
            patch(element, oldElements[i], null, newChild, isSVG);
          }

          j++;
          newKeyed[newKey] = newChild;
        }
      }

      while (i < oldNode.children.length) {
        var oldChild = oldNode.children[i];
        if (getKey(oldChild) == null) {
          removeElement(element, oldElements[i], oldChild);
        }
        i++;
      }

      for (var i in oldKeyed) {
        if (!newKeyed[oldKeyed[i][1].props.key]) {
          removeElement(element, oldKeyed[i][0], oldKeyed[i][1]);
        }
      }
    } else if (node.name === oldNode.name) {
      element.nodeValue = node;
    } else {
      element = parent.insertBefore(
        createElement(node, isSVG),
        (nextSibling = element)
      );
      removeElement(parent, nextSibling, oldNode);
    }
    return element
  }
}

const clense = (a, b) =>
  !b ? a : typeof b[0] === 'string' ? [...a, b] : [...a, ...b];

const build = (x, y, z) => node =>
  !!node && typeof node[1] === 'object' && !Array.isArray(node[1])
    ? {
        [x]: node[0],
        [y]: node[1],
        [z]: Array.isArray(node[2])
          ? node[2].reduce(clense, []).map(build(x, y, z))
          : node[2] + '',
      }
    : build(x, y, z)([node[0], {}, node[1] || '']);

const h$1 = build;

function _isPlaceholder(a) {
       return a != null && typeof a === 'object' && a['@@functional/placeholder'] === true;
}

/**
 * Optimized internal one-arity curry function.
 *
 * @private
 * @category Function
 * @param {Function} fn The function to curry.
 * @return {Function} The curried function.
 */
function _curry1(fn) {
  return function f1(a) {
    if (arguments.length === 0 || _isPlaceholder(a)) {
      return f1;
    } else {
      return fn.apply(this, arguments);
    }
  };
}

/**
 * Returns a function that always returns the given value. Note that for
 * non-primitives the value returned is a reference to the original value.
 *
 * This function is known as `const`, `constant`, or `K` (for K combinator) in
 * other languages and libraries.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig a -> (* -> a)
 * @param {*} val The value to wrap in a function
 * @return {Function} A Function :: * -> val.
 * @example
 *
 *      var t = R.always('Tee');
 *      t(); //=> 'Tee'
 */
var always = /*#__PURE__*/_curry1(function always(val) {
  return function () {
    return val;
  };
});

/**
 * A function that always returns `false`. Any passed in parameters are ignored.
 *
 * @func
 * @memberOf R
 * @since v0.9.0
 * @category Function
 * @sig * -> Boolean
 * @param {*}
 * @return {Boolean}
 * @see R.always, R.T
 * @example
 *
 *      R.F(); //=> false
 */
var F = /*#__PURE__*/always(false);

/**
 * A function that always returns `true`. Any passed in parameters are ignored.
 *
 * @func
 * @memberOf R
 * @since v0.9.0
 * @category Function
 * @sig * -> Boolean
 * @param {*}
 * @return {Boolean}
 * @see R.always, R.F
 * @example
 *
 *      R.T(); //=> true
 */
var T = /*#__PURE__*/always(true);

/**
 * A special placeholder value used to specify "gaps" within curried functions,
 * allowing partial application of any combination of arguments, regardless of
 * their positions.
 *
 * If `g` is a curried ternary function and `_` is `R.__`, the following are
 * equivalent:
 *
 *   - `g(1, 2, 3)`
 *   - `g(_, 2, 3)(1)`
 *   - `g(_, _, 3)(1)(2)`
 *   - `g(_, _, 3)(1, 2)`
 *   - `g(_, 2, _)(1, 3)`
 *   - `g(_, 2)(1)(3)`
 *   - `g(_, 2)(1, 3)`
 *   - `g(_, 2)(_, 3)(1)`
 *
 * @constant
 * @memberOf R
 * @since v0.6.0
 * @category Function
 * @example
 *
 *      var greet = R.replace('{name}', R.__, 'Hello, {name}!');
 *      greet('Alice'); //=> 'Hello, Alice!'
 */

/**
 * Optimized internal two-arity curry function.
 *
 * @private
 * @category Function
 * @param {Function} fn The function to curry.
 * @return {Function} The curried function.
 */
function _curry2(fn) {
  return function f2(a, b) {
    switch (arguments.length) {
      case 0:
        return f2;
      case 1:
        return _isPlaceholder(a) ? f2 : _curry1(function (_b) {
          return fn(a, _b);
        });
      default:
        return _isPlaceholder(a) && _isPlaceholder(b) ? f2 : _isPlaceholder(a) ? _curry1(function (_a) {
          return fn(_a, b);
        }) : _isPlaceholder(b) ? _curry1(function (_b) {
          return fn(a, _b);
        }) : fn(a, b);
    }
  };
}

/**
 * Adds two values.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Math
 * @sig Number -> Number -> Number
 * @param {Number} a
 * @param {Number} b
 * @return {Number}
 * @see R.subtract
 * @example
 *
 *      R.add(2, 3);       //=>  5
 *      R.add(7)(10);      //=> 17
 */
var add = /*#__PURE__*/_curry2(function add(a, b) {
  return Number(a) + Number(b);
});

/**
 * Private `concat` function to merge two array-like objects.
 *
 * @private
 * @param {Array|Arguments} [set1=[]] An array-like object.
 * @param {Array|Arguments} [set2=[]] An array-like object.
 * @return {Array} A new, merged array.
 * @example
 *
 *      _concat([4, 5, 6], [1, 2, 3]); //=> [4, 5, 6, 1, 2, 3]
 */
function _concat(set1, set2) {
  set1 = set1 || [];
  set2 = set2 || [];
  var idx;
  var len1 = set1.length;
  var len2 = set2.length;
  var result = [];

  idx = 0;
  while (idx < len1) {
    result[result.length] = set1[idx];
    idx += 1;
  }
  idx = 0;
  while (idx < len2) {
    result[result.length] = set2[idx];
    idx += 1;
  }
  return result;
}

function _arity(n, fn) {
  /* eslint-disable no-unused-vars */
  switch (n) {
    case 0:
      return function () {
        return fn.apply(this, arguments);
      };
    case 1:
      return function (a0) {
        return fn.apply(this, arguments);
      };
    case 2:
      return function (a0, a1) {
        return fn.apply(this, arguments);
      };
    case 3:
      return function (a0, a1, a2) {
        return fn.apply(this, arguments);
      };
    case 4:
      return function (a0, a1, a2, a3) {
        return fn.apply(this, arguments);
      };
    case 5:
      return function (a0, a1, a2, a3, a4) {
        return fn.apply(this, arguments);
      };
    case 6:
      return function (a0, a1, a2, a3, a4, a5) {
        return fn.apply(this, arguments);
      };
    case 7:
      return function (a0, a1, a2, a3, a4, a5, a6) {
        return fn.apply(this, arguments);
      };
    case 8:
      return function (a0, a1, a2, a3, a4, a5, a6, a7) {
        return fn.apply(this, arguments);
      };
    case 9:
      return function (a0, a1, a2, a3, a4, a5, a6, a7, a8) {
        return fn.apply(this, arguments);
      };
    case 10:
      return function (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
        return fn.apply(this, arguments);
      };
    default:
      throw new Error('First argument to _arity must be a non-negative integer no greater than ten');
  }
}

/**
 * Internal curryN function.
 *
 * @private
 * @category Function
 * @param {Number} length The arity of the curried function.
 * @param {Array} received An array of arguments received thus far.
 * @param {Function} fn The function to curry.
 * @return {Function} The curried function.
 */
function _curryN(length, received, fn) {
  return function () {
    var combined = [];
    var argsIdx = 0;
    var left = length;
    var combinedIdx = 0;
    while (combinedIdx < received.length || argsIdx < arguments.length) {
      var result;
      if (combinedIdx < received.length && (!_isPlaceholder(received[combinedIdx]) || argsIdx >= arguments.length)) {
        result = received[combinedIdx];
      } else {
        result = arguments[argsIdx];
        argsIdx += 1;
      }
      combined[combinedIdx] = result;
      if (!_isPlaceholder(result)) {
        left -= 1;
      }
      combinedIdx += 1;
    }
    return left <= 0 ? fn.apply(this, combined) : _arity(left, _curryN(length, combined, fn));
  };
}

/**
 * Returns a curried equivalent of the provided function, with the specified
 * arity. The curried function has two unusual capabilities. First, its
 * arguments needn't be provided one at a time. If `g` is `R.curryN(3, f)`, the
 * following are equivalent:
 *
 *   - `g(1)(2)(3)`
 *   - `g(1)(2, 3)`
 *   - `g(1, 2)(3)`
 *   - `g(1, 2, 3)`
 *
 * Secondly, the special placeholder value [`R.__`](#__) may be used to specify
 * "gaps", allowing partial application of any combination of arguments,
 * regardless of their positions. If `g` is as above and `_` is [`R.__`](#__),
 * the following are equivalent:
 *
 *   - `g(1, 2, 3)`
 *   - `g(_, 2, 3)(1)`
 *   - `g(_, _, 3)(1)(2)`
 *   - `g(_, _, 3)(1, 2)`
 *   - `g(_, 2)(1)(3)`
 *   - `g(_, 2)(1, 3)`
 *   - `g(_, 2)(_, 3)(1)`
 *
 * @func
 * @memberOf R
 * @since v0.5.0
 * @category Function
 * @sig Number -> (* -> a) -> (* -> a)
 * @param {Number} length The arity for the returned function.
 * @param {Function} fn The function to curry.
 * @return {Function} A new, curried function.
 * @see R.curry
 * @example
 *
 *      var sumArgs = (...args) => R.sum(args);
 *
 *      var curriedAddFourNumbers = R.curryN(4, sumArgs);
 *      var f = curriedAddFourNumbers(1, 2);
 *      var g = f(3);
 *      g(4); //=> 10
 */
var curryN = /*#__PURE__*/_curry2(function curryN(length, fn) {
  if (length === 1) {
    return _curry1(fn);
  }
  return _arity(length, _curryN(length, [], fn));
});

/**
 * Optimized internal three-arity curry function.
 *
 * @private
 * @category Function
 * @param {Function} fn The function to curry.
 * @return {Function} The curried function.
 */
function _curry3(fn) {
  return function f3(a, b, c) {
    switch (arguments.length) {
      case 0:
        return f3;
      case 1:
        return _isPlaceholder(a) ? f3 : _curry2(function (_b, _c) {
          return fn(a, _b, _c);
        });
      case 2:
        return _isPlaceholder(a) && _isPlaceholder(b) ? f3 : _isPlaceholder(a) ? _curry2(function (_a, _c) {
          return fn(_a, b, _c);
        }) : _isPlaceholder(b) ? _curry2(function (_b, _c) {
          return fn(a, _b, _c);
        }) : _curry1(function (_c) {
          return fn(a, b, _c);
        });
      default:
        return _isPlaceholder(a) && _isPlaceholder(b) && _isPlaceholder(c) ? f3 : _isPlaceholder(a) && _isPlaceholder(b) ? _curry2(function (_a, _b) {
          return fn(_a, _b, c);
        }) : _isPlaceholder(a) && _isPlaceholder(c) ? _curry2(function (_a, _c) {
          return fn(_a, b, _c);
        }) : _isPlaceholder(b) && _isPlaceholder(c) ? _curry2(function (_b, _c) {
          return fn(a, _b, _c);
        }) : _isPlaceholder(a) ? _curry1(function (_a) {
          return fn(_a, b, c);
        }) : _isPlaceholder(b) ? _curry1(function (_b) {
          return fn(a, _b, c);
        }) : _isPlaceholder(c) ? _curry1(function (_c) {
          return fn(a, b, _c);
        }) : fn(a, b, c);
    }
  };
}

/**
 * Applies a function to the value at the given index of an array, returning a
 * new copy of the array with the element at the given index replaced with the
 * result of the function application.
 *
 * @func
 * @memberOf R
 * @since v0.14.0
 * @category List
 * @sig (a -> a) -> Number -> [a] -> [a]
 * @param {Function} fn The function to apply.
 * @param {Number} idx The index.
 * @param {Array|Arguments} list An array-like object whose value
 *        at the supplied index will be replaced.
 * @return {Array} A copy of the supplied array-like object with
 *         the element at index `idx` replaced with the value
 *         returned by applying `fn` to the existing element.
 * @see R.update
 * @example
 *
 *      R.adjust(R.add(10), 1, [1, 2, 3]);     //=> [1, 12, 3]
 *      R.adjust(R.add(10))(1)([1, 2, 3]);     //=> [1, 12, 3]
 * @symb R.adjust(f, -1, [a, b]) = [a, f(b)]
 * @symb R.adjust(f, 0, [a, b]) = [f(a), b]
 */
var adjust = /*#__PURE__*/_curry3(function adjust(fn, idx, list) {
  if (idx >= list.length || idx < -list.length) {
    return list;
  }
  var start = idx < 0 ? list.length : 0;
  var _idx = start + idx;
  var _list = _concat(list);
  _list[_idx] = fn(list[_idx]);
  return _list;
});

/**
 * Tests whether or not an object is an array.
 *
 * @private
 * @param {*} val The object to test.
 * @return {Boolean} `true` if `val` is an array, `false` otherwise.
 * @example
 *
 *      _isArray([]); //=> true
 *      _isArray(null); //=> false
 *      _isArray({}); //=> false
 */
var _isArray = Array.isArray || function _isArray(val) {
  return val != null && val.length >= 0 && Object.prototype.toString.call(val) === '[object Array]';
};

function _isTransformer(obj) {
  return typeof obj['@@transducer/step'] === 'function';
}

/**
 * Returns a function that dispatches with different strategies based on the
 * object in list position (last argument). If it is an array, executes [fn].
 * Otherwise, if it has a function with one of the given method names, it will
 * execute that function (functor case). Otherwise, if it is a transformer,
 * uses transducer [xf] to return a new transformer (transducer case).
 * Otherwise, it will default to executing [fn].
 *
 * @private
 * @param {Array} methodNames properties to check for a custom implementation
 * @param {Function} xf transducer to initialize if object is transformer
 * @param {Function} fn default ramda implementation
 * @return {Function} A function that dispatches on object in list position
 */
function _dispatchable(methodNames, xf, fn) {
  return function () {
    if (arguments.length === 0) {
      return fn();
    }
    var args = Array.prototype.slice.call(arguments, 0);
    var obj = args.pop();
    if (!_isArray(obj)) {
      var idx = 0;
      while (idx < methodNames.length) {
        if (typeof obj[methodNames[idx]] === 'function') {
          return obj[methodNames[idx]].apply(obj, args);
        }
        idx += 1;
      }
      if (_isTransformer(obj)) {
        var transducer = xf.apply(null, args);
        return transducer(obj);
      }
    }
    return fn.apply(this, arguments);
  };
}

function _reduced(x) {
  return x && x['@@transducer/reduced'] ? x : {
    '@@transducer/value': x,
    '@@transducer/reduced': true
  };
}

var _xfBase = {
  init: function () {
    return this.xf['@@transducer/init']();
  },
  result: function (result) {
    return this.xf['@@transducer/result'](result);
  }
};

var XAll = /*#__PURE__*/function () {
  function XAll(f, xf) {
    this.xf = xf;
    this.f = f;
    this.all = true;
  }
  XAll.prototype['@@transducer/init'] = _xfBase.init;
  XAll.prototype['@@transducer/result'] = function (result) {
    if (this.all) {
      result = this.xf['@@transducer/step'](result, true);
    }
    return this.xf['@@transducer/result'](result);
  };
  XAll.prototype['@@transducer/step'] = function (result, input) {
    if (!this.f(input)) {
      this.all = false;
      result = _reduced(this.xf['@@transducer/step'](result, false));
    }
    return result;
  };

  return XAll;
}();

var _xall = /*#__PURE__*/_curry2(function _xall(f, xf) {
  return new XAll(f, xf);
});

/**
 * Returns `true` if all elements of the list match the predicate, `false` if
 * there are any that don't.
 *
 * Dispatches to the `all` method of the second argument, if present.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig (a -> Boolean) -> [a] -> Boolean
 * @param {Function} fn The predicate function.
 * @param {Array} list The array to consider.
 * @return {Boolean} `true` if the predicate is satisfied by every element, `false`
 *         otherwise.
 * @see R.any, R.none, R.transduce
 * @example
 *
 *      var equals3 = R.equals(3);
 *      R.all(equals3)([3, 3, 3, 3]); //=> true
 *      R.all(equals3)([3, 3, 1, 3]); //=> false
 */
var all = /*#__PURE__*/_curry2( /*#__PURE__*/_dispatchable(['all'], _xall, function all(fn, list) {
  var idx = 0;
  while (idx < list.length) {
    if (!fn(list[idx])) {
      return false;
    }
    idx += 1;
  }
  return true;
}));

/**
 * Returns the larger of its two arguments.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Relation
 * @sig Ord a => a -> a -> a
 * @param {*} a
 * @param {*} b
 * @return {*}
 * @see R.maxBy, R.min
 * @example
 *
 *      R.max(789, 123); //=> 789
 *      R.max('a', 'b'); //=> 'b'
 */
var max = /*#__PURE__*/_curry2(function max(a, b) {
  return b > a ? b : a;
});

function _map(fn, functor) {
  var idx = 0;
  var len = functor.length;
  var result = Array(len);
  while (idx < len) {
    result[idx] = fn(functor[idx]);
    idx += 1;
  }
  return result;
}

function _isString(x) {
  return Object.prototype.toString.call(x) === '[object String]';
}

/**
 * Tests whether or not an object is similar to an array.
 *
 * @private
 * @category Type
 * @category List
 * @sig * -> Boolean
 * @param {*} x The object to test.
 * @return {Boolean} `true` if `x` has a numeric length property and extreme indices defined; `false` otherwise.
 * @example
 *
 *      _isArrayLike([]); //=> true
 *      _isArrayLike(true); //=> false
 *      _isArrayLike({}); //=> false
 *      _isArrayLike({length: 10}); //=> false
 *      _isArrayLike({0: 'zero', 9: 'nine', length: 10}); //=> true
 */
var _isArrayLike = /*#__PURE__*/_curry1(function isArrayLike(x) {
  if (_isArray(x)) {
    return true;
  }
  if (!x) {
    return false;
  }
  if (typeof x !== 'object') {
    return false;
  }
  if (_isString(x)) {
    return false;
  }
  if (x.nodeType === 1) {
    return !!x.length;
  }
  if (x.length === 0) {
    return true;
  }
  if (x.length > 0) {
    return x.hasOwnProperty(0) && x.hasOwnProperty(x.length - 1);
  }
  return false;
});

var XWrap = /*#__PURE__*/function () {
  function XWrap(fn) {
    this.f = fn;
  }
  XWrap.prototype['@@transducer/init'] = function () {
    throw new Error('init not implemented on XWrap');
  };
  XWrap.prototype['@@transducer/result'] = function (acc) {
    return acc;
  };
  XWrap.prototype['@@transducer/step'] = function (acc, x) {
    return this.f(acc, x);
  };

  return XWrap;
}();

function _xwrap(fn) {
  return new XWrap(fn);
}

/**
 * Creates a function that is bound to a context.
 * Note: `R.bind` does not provide the additional argument-binding capabilities of
 * [Function.prototype.bind](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind).
 *
 * @func
 * @memberOf R
 * @since v0.6.0
 * @category Function
 * @category Object
 * @sig (* -> *) -> {*} -> (* -> *)
 * @param {Function} fn The function to bind to context
 * @param {Object} thisObj The context to bind `fn` to
 * @return {Function} A function that will execute in the context of `thisObj`.
 * @see R.partial
 * @example
 *
 *      var log = R.bind(console.log, console);
 *      R.pipe(R.assoc('a', 2), R.tap(log), R.assoc('a', 3))({a: 1}); //=> {a: 3}
 *      // logs {a: 2}
 * @symb R.bind(f, o)(a, b) = f.call(o, a, b)
 */
var bind = /*#__PURE__*/_curry2(function bind(fn, thisObj) {
  return _arity(fn.length, function () {
    return fn.apply(thisObj, arguments);
  });
});

function _arrayReduce(xf, acc, list) {
  var idx = 0;
  var len = list.length;
  while (idx < len) {
    acc = xf['@@transducer/step'](acc, list[idx]);
    if (acc && acc['@@transducer/reduced']) {
      acc = acc['@@transducer/value'];
      break;
    }
    idx += 1;
  }
  return xf['@@transducer/result'](acc);
}

function _iterableReduce(xf, acc, iter) {
  var step = iter.next();
  while (!step.done) {
    acc = xf['@@transducer/step'](acc, step.value);
    if (acc && acc['@@transducer/reduced']) {
      acc = acc['@@transducer/value'];
      break;
    }
    step = iter.next();
  }
  return xf['@@transducer/result'](acc);
}

function _methodReduce(xf, acc, obj, methodName) {
  return xf['@@transducer/result'](obj[methodName](bind(xf['@@transducer/step'], xf), acc));
}

var symIterator = typeof Symbol !== 'undefined' ? Symbol.iterator : '@@iterator';

function _reduce(fn, acc, list) {
  if (typeof fn === 'function') {
    fn = _xwrap(fn);
  }
  if (_isArrayLike(list)) {
    return _arrayReduce(fn, acc, list);
  }
  if (typeof list['fantasy-land/reduce'] === 'function') {
    return _methodReduce(fn, acc, list, 'fantasy-land/reduce');
  }
  if (list[symIterator] != null) {
    return _iterableReduce(fn, acc, list[symIterator]());
  }
  if (typeof list.next === 'function') {
    return _iterableReduce(fn, acc, list);
  }
  if (typeof list.reduce === 'function') {
    return _methodReduce(fn, acc, list, 'reduce');
  }

  throw new TypeError('reduce: list must be array or iterable');
}

var XMap = /*#__PURE__*/function () {
  function XMap(f, xf) {
    this.xf = xf;
    this.f = f;
  }
  XMap.prototype['@@transducer/init'] = _xfBase.init;
  XMap.prototype['@@transducer/result'] = _xfBase.result;
  XMap.prototype['@@transducer/step'] = function (result, input) {
    return this.xf['@@transducer/step'](result, this.f(input));
  };

  return XMap;
}();

var _xmap = /*#__PURE__*/_curry2(function _xmap(f, xf) {
  return new XMap(f, xf);
});

function _has(prop, obj) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var toString = Object.prototype.toString;
var _isArguments = function () {
  return toString.call(arguments) === '[object Arguments]' ? function _isArguments(x) {
    return toString.call(x) === '[object Arguments]';
  } : function _isArguments(x) {
    return _has('callee', x);
  };
};

// cover IE < 9 keys issues
var hasEnumBug = ! /*#__PURE__*/{ toString: null }.propertyIsEnumerable('toString');
var nonEnumerableProps = ['constructor', 'valueOf', 'isPrototypeOf', 'toString', 'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];
// Safari bug
var hasArgsEnumBug = /*#__PURE__*/function () {
  return arguments.propertyIsEnumerable('length');
}();

var contains = function contains(list, item) {
  var idx = 0;
  while (idx < list.length) {
    if (list[idx] === item) {
      return true;
    }
    idx += 1;
  }
  return false;
};

/**
 * Returns a list containing the names of all the enumerable own properties of
 * the supplied object.
 * Note that the order of the output array is not guaranteed to be consistent
 * across different JS platforms.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Object
 * @sig {k: v} -> [k]
 * @param {Object} obj The object to extract properties from
 * @return {Array} An array of the object's own properties.
 * @see R.keysIn, R.values
 * @example
 *
 *      R.keys({a: 1, b: 2, c: 3}); //=> ['a', 'b', 'c']
 */
var _keys = typeof Object.keys === 'function' && !hasArgsEnumBug ? function keys(obj) {
  return Object(obj) !== obj ? [] : Object.keys(obj);
} : function keys(obj) {
  if (Object(obj) !== obj) {
    return [];
  }
  var prop, nIdx;
  var ks = [];
  var checkArgsLength = hasArgsEnumBug && _isArguments(obj);
  for (prop in obj) {
    if (_has(prop, obj) && (!checkArgsLength || prop !== 'length')) {
      ks[ks.length] = prop;
    }
  }
  if (hasEnumBug) {
    nIdx = nonEnumerableProps.length - 1;
    while (nIdx >= 0) {
      prop = nonEnumerableProps[nIdx];
      if (_has(prop, obj) && !contains(ks, prop)) {
        ks[ks.length] = prop;
      }
      nIdx -= 1;
    }
  }
  return ks;
};
var keys = /*#__PURE__*/_curry1(_keys);

/**
 * Takes a function and
 * a [functor](https://github.com/fantasyland/fantasy-land#functor),
 * applies the function to each of the functor's values, and returns
 * a functor of the same shape.
 *
 * Ramda provides suitable `map` implementations for `Array` and `Object`,
 * so this function may be applied to `[1, 2, 3]` or `{x: 1, y: 2, z: 3}`.
 *
 * Dispatches to the `map` method of the second argument, if present.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * Also treats functions as functors and will compose them together.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig Functor f => (a -> b) -> f a -> f b
 * @param {Function} fn The function to be called on every element of the input `list`.
 * @param {Array} list The list to be iterated over.
 * @return {Array} The new list.
 * @see R.transduce, R.addIndex
 * @example
 *
 *      var double = x => x * 2;
 *
 *      R.map(double, [1, 2, 3]); //=> [2, 4, 6]
 *
 *      R.map(double, {x: 1, y: 2, z: 3}); //=> {x: 2, y: 4, z: 6}
 * @symb R.map(f, [a, b]) = [f(a), f(b)]
 * @symb R.map(f, { x: a, y: b }) = { x: f(a), y: f(b) }
 * @symb R.map(f, functor_o) = functor_o.map(f)
 */
var map = /*#__PURE__*/_curry2( /*#__PURE__*/_dispatchable(['fantasy-land/map', 'map'], _xmap, function map(fn, functor) {
  switch (Object.prototype.toString.call(functor)) {
    case '[object Function]':
      return curryN(functor.length, function () {
        return fn.call(this, functor.apply(this, arguments));
      });
    case '[object Object]':
      return _reduce(function (acc, key) {
        acc[key] = fn(functor[key]);
        return acc;
      }, {}, keys(functor));
    default:
      return _map(fn, functor);
  }
}));

/**
 * Retrieve the value at a given path.
 *
 * @func
 * @memberOf R
 * @since v0.2.0
 * @category Object
 * @typedefn Idx = String | Int
 * @sig [Idx] -> {a} -> a | Undefined
 * @param {Array} path The path to use.
 * @param {Object} obj The object to retrieve the nested property from.
 * @return {*} The data at `path`.
 * @see R.prop
 * @example
 *
 *      R.path(['a', 'b'], {a: {b: 2}}); //=> 2
 *      R.path(['a', 'b'], {c: {b: 2}}); //=> undefined
 */
var path = /*#__PURE__*/_curry2(function path(paths, obj) {
  var val = obj;
  var idx = 0;
  while (idx < paths.length) {
    if (val == null) {
      return;
    }
    val = val[paths[idx]];
    idx += 1;
  }
  return val;
});

/**
 * Returns a function that when supplied an object returns the indicated
 * property of that object, if it exists.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Object
 * @sig s -> {s: a} -> a | Undefined
 * @param {String} p The property name
 * @param {Object} obj The object to query
 * @return {*} The value at `obj.p`.
 * @see R.path
 * @example
 *
 *      R.prop('x', {x: 100}); //=> 100
 *      R.prop('x', {}); //=> undefined
 */

var prop = /*#__PURE__*/_curry2(function prop(p, obj) {
  return path([p], obj);
});

/**
 * Returns a new list by plucking the same named property off all objects in
 * the list supplied.
 *
 * `pluck` will work on
 * any [functor](https://github.com/fantasyland/fantasy-land#functor) in
 * addition to arrays, as it is equivalent to `R.map(R.prop(k), f)`.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig Functor f => k -> f {k: v} -> f v
 * @param {Number|String} key The key name to pluck off of each object.
 * @param {Array} f The array or functor to consider.
 * @return {Array} The list of values for the given key.
 * @see R.props
 * @example
 *
 *      R.pluck('a')([{a: 1}, {a: 2}]); //=> [1, 2]
 *      R.pluck(0)([[1, 2], [3, 4]]);   //=> [1, 3]
 *      R.pluck('val', {a: {val: 3}, b: {val: 5}}); //=> {a: 3, b: 5}
 * @symb R.pluck('x', [{x: 1, y: 2}, {x: 3, y: 4}, {x: 5, y: 6}]) = [1, 3, 5]
 * @symb R.pluck(0, [[1, 2], [3, 4], [5, 6]]) = [1, 3, 5]
 */
var pluck = /*#__PURE__*/_curry2(function pluck(p, list) {
  return map(prop(p), list);
});

/**
 * Returns a single item by iterating through the list, successively calling
 * the iterator function and passing it an accumulator value and the current
 * value from the array, and then passing the result to the next call.
 *
 * The iterator function receives two values: *(acc, value)*. It may use
 * [`R.reduced`](#reduced) to shortcut the iteration.
 *
 * The arguments' order of [`reduceRight`](#reduceRight)'s iterator function
 * is *(value, acc)*.
 *
 * Note: `R.reduce` does not skip deleted or unassigned indices (sparse
 * arrays), unlike the native `Array.prototype.reduce` method. For more details
 * on this behavior, see:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce#Description
 *
 * Dispatches to the `reduce` method of the third argument, if present. When
 * doing so, it is up to the user to handle the [`R.reduced`](#reduced)
 * shortcuting, as this is not implemented by `reduce`.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig ((a, b) -> a) -> a -> [b] -> a
 * @param {Function} fn The iterator function. Receives two values, the accumulator and the
 *        current element from the array.
 * @param {*} acc The accumulator value.
 * @param {Array} list The list to iterate over.
 * @return {*} The final, accumulated value.
 * @see R.reduced, R.addIndex, R.reduceRight
 * @example
 *
 *      R.reduce(R.subtract, 0, [1, 2, 3, 4]) // => ((((0 - 1) - 2) - 3) - 4) = -10
 *      //          -               -10
 *      //         / \              / \
 *      //        -   4           -6   4
 *      //       / \              / \
 *      //      -   3   ==>     -3   3
 *      //     / \              / \
 *      //    -   2           -1   2
 *      //   / \              / \
 *      //  0   1            0   1
 *
 * @symb R.reduce(f, a, [b, c, d]) = f(f(f(a, b), c), d)
 */
var reduce = /*#__PURE__*/_curry3(_reduce);

/**
 * ap applies a list of functions to a list of values.
 *
 * Dispatches to the `ap` method of the second argument, if present. Also
 * treats curried functions as applicatives.
 *
 * @func
 * @memberOf R
 * @since v0.3.0
 * @category Function
 * @sig [a -> b] -> [a] -> [b]
 * @sig Apply f => f (a -> b) -> f a -> f b
 * @sig (a -> b -> c) -> (a -> b) -> (a -> c)
 * @param {*} applyF
 * @param {*} applyX
 * @return {*}
 * @example
 *
 *      R.ap([R.multiply(2), R.add(3)], [1,2,3]); //=> [2, 4, 6, 4, 5, 6]
 *      R.ap([R.concat('tasty '), R.toUpper], ['pizza', 'salad']); //=> ["tasty pizza", "tasty salad", "PIZZA", "SALAD"]
 *
 *      // R.ap can also be used as S combinator
 *      // when only two functions are passed
 *      R.ap(R.concat, R.toUpper)('Ramda') //=> 'RamdaRAMDA'
 * @symb R.ap([f, g], [a, b]) = [f(a), f(b), g(a), g(b)]
 */
var ap = /*#__PURE__*/_curry2(function ap(applyF, applyX) {
  return typeof applyX['fantasy-land/ap'] === 'function' ? applyX['fantasy-land/ap'](applyF) : typeof applyF.ap === 'function' ? applyF.ap(applyX) : typeof applyF === 'function' ? function (x) {
    return applyF(x)(applyX(x));
  } :
  // else
  _reduce(function (acc, f) {
    return _concat(acc, map(f, applyX));
  }, [], applyF);
});

/**
 * Returns a new list containing the contents of the given list, followed by
 * the given element.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig a -> [a] -> [a]
 * @param {*} el The element to add to the end of the new list.
 * @param {Array} list The list of elements to add a new item to.
 *        list.
 * @return {Array} A new list containing the elements of the old list followed by `el`.
 * @see R.prepend
 * @example
 *
 *      R.append('tests', ['write', 'more']); //=> ['write', 'more', 'tests']
 *      R.append('tests', []); //=> ['tests']
 *      R.append(['tests'], ['write', 'more']); //=> ['write', 'more', ['tests']]
 */
var append = /*#__PURE__*/_curry2(function append(el, list) {
  return _concat(list, [el]);
});

/**
 * Determine if the passed argument is an integer.
 *
 * @private
 * @param {*} n
 * @category Type
 * @return {Boolean}
 */

function _isFunction(x) {
  return Object.prototype.toString.call(x) === '[object Function]';
}

/**
 * "lifts" a function to be the specified arity, so that it may "map over" that
 * many lists, Functions or other objects that satisfy the [FantasyLand Apply spec](https://github.com/fantasyland/fantasy-land#apply).
 *
 * @func
 * @memberOf R
 * @since v0.7.0
 * @category Function
 * @sig Number -> (*... -> *) -> ([*]... -> [*])
 * @param {Function} fn The function to lift into higher context
 * @return {Function} The lifted function.
 * @see R.lift, R.ap
 * @example
 *
 *      var madd3 = R.liftN(3, (...args) => R.sum(args));
 *      madd3([1,2,3], [1,2,3], [1]); //=> [3, 4, 5, 4, 5, 6, 5, 6, 7]
 */
var liftN = /*#__PURE__*/_curry2(function liftN(arity, fn) {
  var lifted = curryN(arity, fn);
  return curryN(arity, function () {
    return _reduce(ap, map(lifted, arguments[0]), Array.prototype.slice.call(arguments, 1));
  });
});

/**
 * "lifts" a function of arity > 1 so that it may "map over" a list, Function or other
 * object that satisfies the [FantasyLand Apply spec](https://github.com/fantasyland/fantasy-land#apply).
 *
 * @func
 * @memberOf R
 * @since v0.7.0
 * @category Function
 * @sig (*... -> *) -> ([*]... -> [*])
 * @param {Function} fn The function to lift into higher context
 * @return {Function} The lifted function.
 * @see R.liftN
 * @example
 *
 *      var madd3 = R.lift((a, b, c) => a + b + c);
 *
 *      madd3([1,2,3], [1,2,3], [1]); //=> [3, 4, 5, 4, 5, 6, 5, 6, 7]
 *
 *      var madd5 = R.lift((a, b, c, d, e) => a + b + c + d + e);
 *
 *      madd5([1,2], [3], [4, 5], [6], [7, 8]); //=> [21, 22, 22, 23, 22, 23, 23, 24]
 */
var lift = /*#__PURE__*/_curry1(function lift(fn) {
  return liftN(fn.length, fn);
});

/**
 * Returns a curried equivalent of the provided function. The curried function
 * has two unusual capabilities. First, its arguments needn't be provided one
 * at a time. If `f` is a ternary function and `g` is `R.curry(f)`, the
 * following are equivalent:
 *
 *   - `g(1)(2)(3)`
 *   - `g(1)(2, 3)`
 *   - `g(1, 2)(3)`
 *   - `g(1, 2, 3)`
 *
 * Secondly, the special placeholder value [`R.__`](#__) may be used to specify
 * "gaps", allowing partial application of any combination of arguments,
 * regardless of their positions. If `g` is as above and `_` is [`R.__`](#__),
 * the following are equivalent:
 *
 *   - `g(1, 2, 3)`
 *   - `g(_, 2, 3)(1)`
 *   - `g(_, _, 3)(1)(2)`
 *   - `g(_, _, 3)(1, 2)`
 *   - `g(_, 2)(1)(3)`
 *   - `g(_, 2)(1, 3)`
 *   - `g(_, 2)(_, 3)(1)`
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig (* -> a) -> (* -> a)
 * @param {Function} fn The function to curry.
 * @return {Function} A new, curried function.
 * @see R.curryN
 * @example
 *
 *      var addFourNumbers = (a, b, c, d) => a + b + c + d;
 *
 *      var curriedAddFourNumbers = R.curry(addFourNumbers);
 *      var f = curriedAddFourNumbers(1, 2);
 *      var g = f(3);
 *      g(4); //=> 10
 */
var curry = /*#__PURE__*/_curry1(function curry(fn) {
  return curryN(fn.length, fn);
});

/**
 * Returns the result of calling its first argument with the remaining
 * arguments. This is occasionally useful as a converging function for
 * [`R.converge`](#converge): the first branch can produce a function while the
 * remaining branches produce values to be passed to that function as its
 * arguments.
 *
 * @func
 * @memberOf R
 * @since v0.9.0
 * @category Function
 * @sig (*... -> a),*... -> a
 * @param {Function} fn The function to apply to the remaining arguments.
 * @param {...*} args Any number of positional arguments.
 * @return {*}
 * @see R.apply
 * @example
 *
 *      R.call(R.add, 1, 2); //=> 3
 *
 *      var indentN = R.pipe(R.repeat(' '),
 *                           R.join(''),
 *                           R.replace(/^(?!$)/gm));
 *
 *      var format = R.converge(R.call, [
 *                                  R.pipe(R.prop('indent'), indentN),
 *                                  R.prop('value')
 *                              ]);
 *
 *      format({indent: 2, value: 'foo\nbar\nbaz\n'}); //=> '  foo\n  bar\n  baz\n'
 * @symb R.call(f, a, b) = f(a, b)
 */
var call = /*#__PURE__*/curry(function call(fn) {
  return fn.apply(this, Array.prototype.slice.call(arguments, 1));
});

/**
 * `_makeFlat` is a helper function that returns a one-level or fully recursive
 * function based on the flag passed in.
 *
 * @private
 */
function _makeFlat(recursive) {
  return function flatt(list) {
    var value, jlen, j;
    var result = [];
    var idx = 0;
    var ilen = list.length;

    while (idx < ilen) {
      if (_isArrayLike(list[idx])) {
        value = recursive ? flatt(list[idx]) : list[idx];
        j = 0;
        jlen = value.length;
        while (j < jlen) {
          result[result.length] = value[j];
          j += 1;
        }
      } else {
        result[result.length] = list[idx];
      }
      idx += 1;
    }
    return result;
  };
}

function _forceReduced(x) {
  return {
    '@@transducer/value': x,
    '@@transducer/reduced': true
  };
}

var preservingReduced = function (xf) {
  return {
    '@@transducer/init': _xfBase.init,
    '@@transducer/result': function (result) {
      return xf['@@transducer/result'](result);
    },
    '@@transducer/step': function (result, input) {
      var ret = xf['@@transducer/step'](result, input);
      return ret['@@transducer/reduced'] ? _forceReduced(ret) : ret;
    }
  };
};

var _flatCat = function _xcat(xf) {
  var rxf = preservingReduced(xf);
  return {
    '@@transducer/init': _xfBase.init,
    '@@transducer/result': function (result) {
      return rxf['@@transducer/result'](result);
    },
    '@@transducer/step': function (result, input) {
      return !_isArrayLike(input) ? _reduce(rxf, result, [input]) : _reduce(rxf, result, input);
    }
  };
};

var _xchain = /*#__PURE__*/_curry2(function _xchain(f, xf) {
  return map(f, _flatCat(xf));
});

/**
 * `chain` maps a function over a list and concatenates the results. `chain`
 * is also known as `flatMap` in some libraries
 *
 * Dispatches to the `chain` method of the second argument, if present,
 * according to the [FantasyLand Chain spec](https://github.com/fantasyland/fantasy-land#chain).
 *
 * @func
 * @memberOf R
 * @since v0.3.0
 * @category List
 * @sig Chain m => (a -> m b) -> m a -> m b
 * @param {Function} fn The function to map with
 * @param {Array} list The list to map over
 * @return {Array} The result of flat-mapping `list` with `fn`
 * @example
 *
 *      var duplicate = n => [n, n];
 *      R.chain(duplicate, [1, 2, 3]); //=> [1, 1, 2, 2, 3, 3]
 *
 *      R.chain(R.append, R.head)([1, 2, 3]); //=> [1, 2, 3, 1]
 */
var chain = /*#__PURE__*/_curry2( /*#__PURE__*/_dispatchable(['fantasy-land/chain', 'chain'], _xchain, function chain(fn, monad) {
  if (typeof monad === 'function') {
    return function (x) {
      return fn(monad(x))(x);
    };
  }
  return _makeFlat(false)(map(fn, monad));
}));

/**
 * Gives a single-word string description of the (native) type of a value,
 * returning such answers as 'Object', 'Number', 'Array', or 'Null'. Does not
 * attempt to distinguish user Object types any further, reporting them all as
 * 'Object'.
 *
 * @func
 * @memberOf R
 * @since v0.8.0
 * @category Type
 * @sig (* -> {*}) -> String
 * @param {*} val The value to test
 * @return {String}
 * @example
 *
 *      R.type({}); //=> "Object"
 *      R.type(1); //=> "Number"
 *      R.type(false); //=> "Boolean"
 *      R.type('s'); //=> "String"
 *      R.type(null); //=> "Null"
 *      R.type([]); //=> "Array"
 *      R.type(/[A-z]/); //=> "RegExp"
 *      R.type(() => {}); //=> "Function"
 *      R.type(undefined); //=> "Undefined"
 */
var type = /*#__PURE__*/_curry1(function type(val) {
  return val === null ? 'Null' : val === undefined ? 'Undefined' : Object.prototype.toString.call(val).slice(8, -1);
});

/**
 * A function that returns the `!` of its argument. It will return `true` when
 * passed false-y value, and `false` when passed a truth-y one.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Logic
 * @sig * -> Boolean
 * @param {*} a any value
 * @return {Boolean} the logical inverse of passed argument.
 * @see R.complement
 * @example
 *
 *      R.not(true); //=> false
 *      R.not(false); //=> true
 *      R.not(0); //=> true
 *      R.not(1); //=> false
 */
var not = /*#__PURE__*/_curry1(function not(a) {
  return !a;
});

/**
 * Takes a function `f` and returns a function `g` such that if called with the same arguments
 * when `f` returns a "truthy" value, `g` returns `false` and when `f` returns a "falsy" value `g` returns `true`.
 *
 * `R.complement` may be applied to any functor
 *
 * @func
 * @memberOf R
 * @since v0.12.0
 * @category Logic
 * @sig (*... -> *) -> (*... -> Boolean)
 * @param {Function} f
 * @return {Function}
 * @see R.not
 * @example
 *
 *      var isNotNil = R.complement(R.isNil);
 *      isNil(null); //=> true
 *      isNotNil(null); //=> false
 *      isNil(7); //=> false
 *      isNotNil(7); //=> true
 */
var complement = /*#__PURE__*/lift(not);

function _pipe(f, g) {
  return function () {
    return g.call(this, f.apply(this, arguments));
  };
}

/**
 * This checks whether a function has a [methodname] function. If it isn't an
 * array it will execute that function otherwise it will default to the ramda
 * implementation.
 *
 * @private
 * @param {Function} fn ramda implemtation
 * @param {String} methodname property to check for a custom implementation
 * @return {Object} Whatever the return value of the method is.
 */
function _checkForMethod(methodname, fn) {
  return function () {
    var length = arguments.length;
    if (length === 0) {
      return fn();
    }
    var obj = arguments[length - 1];
    return _isArray(obj) || typeof obj[methodname] !== 'function' ? fn.apply(this, arguments) : obj[methodname].apply(obj, Array.prototype.slice.call(arguments, 0, length - 1));
  };
}

/**
 * Returns the elements of the given list or string (or object with a `slice`
 * method) from `fromIndex` (inclusive) to `toIndex` (exclusive).
 *
 * Dispatches to the `slice` method of the third argument, if present.
 *
 * @func
 * @memberOf R
 * @since v0.1.4
 * @category List
 * @sig Number -> Number -> [a] -> [a]
 * @sig Number -> Number -> String -> String
 * @param {Number} fromIndex The start index (inclusive).
 * @param {Number} toIndex The end index (exclusive).
 * @param {*} list
 * @return {*}
 * @example
 *
 *      R.slice(1, 3, ['a', 'b', 'c', 'd']);        //=> ['b', 'c']
 *      R.slice(1, Infinity, ['a', 'b', 'c', 'd']); //=> ['b', 'c', 'd']
 *      R.slice(0, -1, ['a', 'b', 'c', 'd']);       //=> ['a', 'b', 'c']
 *      R.slice(-3, -1, ['a', 'b', 'c', 'd']);      //=> ['b', 'c']
 *      R.slice(0, 3, 'ramda');                     //=> 'ram'
 */
var slice = /*#__PURE__*/_curry3( /*#__PURE__*/_checkForMethod('slice', function slice(fromIndex, toIndex, list) {
  return Array.prototype.slice.call(list, fromIndex, toIndex);
}));

/**
 * Returns all but the first element of the given list or string (or object
 * with a `tail` method).
 *
 * Dispatches to the `slice` method of the first argument, if present.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig [a] -> [a]
 * @sig String -> String
 * @param {*} list
 * @return {*}
 * @see R.head, R.init, R.last
 * @example
 *
 *      R.tail([1, 2, 3]);  //=> [2, 3]
 *      R.tail([1, 2]);     //=> [2]
 *      R.tail([1]);        //=> []
 *      R.tail([]);         //=> []
 *
 *      R.tail('abc');  //=> 'bc'
 *      R.tail('ab');   //=> 'b'
 *      R.tail('a');    //=> ''
 *      R.tail('');     //=> ''
 */
var tail = /*#__PURE__*/_curry1( /*#__PURE__*/_checkForMethod('tail', /*#__PURE__*/slice(1, Infinity)));

/**
 * Performs left-to-right function composition. The leftmost function may have
 * any arity; the remaining functions must be unary.
 *
 * In some libraries this function is named `sequence`.
 *
 * **Note:** The result of pipe is not automatically curried.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig (((a, b, ..., n) -> o), (o -> p), ..., (x -> y), (y -> z)) -> ((a, b, ..., n) -> z)
 * @param {...Function} functions
 * @return {Function}
 * @see R.compose
 * @example
 *
 *      var f = R.pipe(Math.pow, R.negate, R.inc);
 *
 *      f(3, 4); // -(3^4) + 1
 * @symb R.pipe(f, g, h)(a, b) = h(g(f(a, b)))
 */
function pipe() {
  if (arguments.length === 0) {
    throw new Error('pipe requires at least one argument');
  }
  return _arity(arguments[0].length, reduce(_pipe, arguments[0], tail(arguments)));
}

/**
 * Returns a new list or string with the elements or characters in reverse
 * order.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig [a] -> [a]
 * @sig String -> String
 * @param {Array|String} list
 * @return {Array|String}
 * @example
 *
 *      R.reverse([1, 2, 3]);  //=> [3, 2, 1]
 *      R.reverse([1, 2]);     //=> [2, 1]
 *      R.reverse([1]);        //=> [1]
 *      R.reverse([]);         //=> []
 *
 *      R.reverse('abc');      //=> 'cba'
 *      R.reverse('ab');       //=> 'ba'
 *      R.reverse('a');        //=> 'a'
 *      R.reverse('');         //=> ''
 */
var reverse = /*#__PURE__*/_curry1(function reverse(list) {
  return _isString(list) ? list.split('').reverse().join('') : Array.prototype.slice.call(list, 0).reverse();
});

/**
 * Performs right-to-left function composition. The rightmost function may have
 * any arity; the remaining functions must be unary.
 *
 * **Note:** The result of compose is not automatically curried.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig ((y -> z), (x -> y), ..., (o -> p), ((a, b, ..., n) -> o)) -> ((a, b, ..., n) -> z)
 * @param {...Function} ...functions The functions to compose
 * @return {Function}
 * @see R.pipe
 * @example
 *
 *      var classyGreeting = (firstName, lastName) => "The name's " + lastName + ", " + firstName + " " + lastName
 *      var yellGreeting = R.compose(R.toUpper, classyGreeting);
 *      yellGreeting('James', 'Bond'); //=> "THE NAME'S BOND, JAMES BOND"
 *
 *      R.compose(Math.abs, R.add(1), R.multiply(2))(-4) //=> 7
 *
 * @symb R.compose(f, g, h)(a, b) = f(g(h(a, b)))
 */
function compose() {
  if (arguments.length === 0) {
    throw new Error('compose requires at least one argument');
  }
  return pipe.apply(this, reverse(arguments));
}

function _arrayFromIterator(iter) {
  var list = [];
  var next;
  while (!(next = iter.next()).done) {
    list.push(next.value);
  }
  return list;
}

function _containsWith(pred, x, list) {
  var idx = 0;
  var len = list.length;

  while (idx < len) {
    if (pred(x, list[idx])) {
      return true;
    }
    idx += 1;
  }
  return false;
}

function _functionName(f) {
  // String(x => x) evaluates to "x => x", so the pattern may not match.
  var match = String(f).match(/^function (\w*)/);
  return match == null ? '' : match[1];
}

/**
 * Returns true if its arguments are identical, false otherwise. Values are
 * identical if they reference the same memory. `NaN` is identical to `NaN`;
 * `0` and `-0` are not identical.
 *
 * @func
 * @memberOf R
 * @since v0.15.0
 * @category Relation
 * @sig a -> a -> Boolean
 * @param {*} a
 * @param {*} b
 * @return {Boolean}
 * @example
 *
 *      var o = {};
 *      R.identical(o, o); //=> true
 *      R.identical(1, 1); //=> true
 *      R.identical(1, '1'); //=> false
 *      R.identical([], []); //=> false
 *      R.identical(0, -0); //=> false
 *      R.identical(NaN, NaN); //=> true
 */
var identical = /*#__PURE__*/_curry2(function identical(a, b) {
  // SameValue algorithm
  if (a === b) {
    // Steps 1-5, 7-10
    // Steps 6.b-6.e: +0 != -0
    return a !== 0 || 1 / a === 1 / b;
  } else {
    // Step 6.a: NaN == NaN
    return a !== a && b !== b;
  }
});

/**
 * private _uniqContentEquals function.
 * That function is checking equality of 2 iterator contents with 2 assumptions
 * - iterators lengths are the same
 * - iterators values are unique
 *
 * false-positive result will be returned for comparision of, e.g.
 * - [1,2,3] and [1,2,3,4]
 * - [1,1,1] and [1,2,3]
 * */

function _uniqContentEquals(aIterator, bIterator, stackA, stackB) {
  var a = _arrayFromIterator(aIterator);
  var b = _arrayFromIterator(bIterator);

  function eq(_a, _b) {
    return _equals(_a, _b, stackA.slice(), stackB.slice());
  }

  // if *a* array contains any element that is not included in *b*
  return !_containsWith(function (b, aItem) {
    return !_containsWith(eq, aItem, b);
  }, b, a);
}

function _equals(a, b, stackA, stackB) {
  if (identical(a, b)) {
    return true;
  }

  var typeA = type(a);

  if (typeA !== type(b)) {
    return false;
  }

  if (a == null || b == null) {
    return false;
  }

  if (typeof a['fantasy-land/equals'] === 'function' || typeof b['fantasy-land/equals'] === 'function') {
    return typeof a['fantasy-land/equals'] === 'function' && a['fantasy-land/equals'](b) && typeof b['fantasy-land/equals'] === 'function' && b['fantasy-land/equals'](a);
  }

  if (typeof a.equals === 'function' || typeof b.equals === 'function') {
    return typeof a.equals === 'function' && a.equals(b) && typeof b.equals === 'function' && b.equals(a);
  }

  switch (typeA) {
    case 'Arguments':
    case 'Array':
    case 'Object':
      if (typeof a.constructor === 'function' && _functionName(a.constructor) === 'Promise') {
        return a === b;
      }
      break;
    case 'Boolean':
    case 'Number':
    case 'String':
      if (!(typeof a === typeof b && identical(a.valueOf(), b.valueOf()))) {
        return false;
      }
      break;
    case 'Date':
      if (!identical(a.valueOf(), b.valueOf())) {
        return false;
      }
      break;
    case 'Error':
      return a.name === b.name && a.message === b.message;
    case 'RegExp':
      if (!(a.source === b.source && a.global === b.global && a.ignoreCase === b.ignoreCase && a.multiline === b.multiline && a.sticky === b.sticky && a.unicode === b.unicode)) {
        return false;
      }
      break;
  }

  var idx = stackA.length - 1;
  while (idx >= 0) {
    if (stackA[idx] === a) {
      return stackB[idx] === b;
    }
    idx -= 1;
  }

  switch (typeA) {
    case 'Map':
      if (a.size !== b.size) {
        return false;
      }

      return _uniqContentEquals(a.entries(), b.entries(), stackA.concat([a]), stackB.concat([b]));
    case 'Set':
      if (a.size !== b.size) {
        return false;
      }

      return _uniqContentEquals(a.values(), b.values(), stackA.concat([a]), stackB.concat([b]));
    case 'Arguments':
    case 'Array':
    case 'Object':
    case 'Boolean':
    case 'Number':
    case 'String':
    case 'Date':
    case 'Error':
    case 'RegExp':
    case 'Int8Array':
    case 'Uint8Array':
    case 'Uint8ClampedArray':
    case 'Int16Array':
    case 'Uint16Array':
    case 'Int32Array':
    case 'Uint32Array':
    case 'Float32Array':
    case 'Float64Array':
    case 'ArrayBuffer':
      break;
    default:
      // Values of other types are only equal if identical.
      return false;
  }

  var keysA = keys(a);
  if (keysA.length !== keys(b).length) {
    return false;
  }

  var extendedStackA = stackA.concat([a]);
  var extendedStackB = stackB.concat([b]);

  idx = keysA.length - 1;
  while (idx >= 0) {
    var key = keysA[idx];
    if (!(_has(key, b) && _equals(b[key], a[key], extendedStackA, extendedStackB))) {
      return false;
    }
    idx -= 1;
  }
  return true;
}

/**
 * Returns `true` if its arguments are equivalent, `false` otherwise. Handles
 * cyclical data structures.
 *
 * Dispatches symmetrically to the `equals` methods of both arguments, if
 * present.
 *
 * @func
 * @memberOf R
 * @since v0.15.0
 * @category Relation
 * @sig a -> b -> Boolean
 * @param {*} a
 * @param {*} b
 * @return {Boolean}
 * @example
 *
 *      R.equals(1, 1); //=> true
 *      R.equals(1, '1'); //=> false
 *      R.equals([1, 2, 3], [1, 2, 3]); //=> true
 *
 *      var a = {}; a.v = a;
 *      var b = {}; b.v = b;
 *      R.equals(a, b); //=> true
 */
var equals = /*#__PURE__*/_curry2(function equals(a, b) {
  return _equals(a, b, [], []);
});

function _indexOf(list, a, idx) {
  var inf, item;
  // Array.prototype.indexOf doesn't exist below IE9
  if (typeof list.indexOf === 'function') {
    switch (typeof a) {
      case 'number':
        if (a === 0) {
          // manually crawl the list to distinguish between +0 and -0
          inf = 1 / a;
          while (idx < list.length) {
            item = list[idx];
            if (item === 0 && 1 / item === inf) {
              return idx;
            }
            idx += 1;
          }
          return -1;
        } else if (a !== a) {
          // NaN
          while (idx < list.length) {
            item = list[idx];
            if (typeof item === 'number' && item !== item) {
              return idx;
            }
            idx += 1;
          }
          return -1;
        }
        // non-zero numbers can utilise Set
        return list.indexOf(a, idx);

      // all these types can utilise Set
      case 'string':
      case 'boolean':
      case 'function':
      case 'undefined':
        return list.indexOf(a, idx);

      case 'object':
        if (a === null) {
          // null can utilise Set
          return list.indexOf(a, idx);
        }
    }
  }
  // anything else not covered above, defer to R.equals
  while (idx < list.length) {
    if (equals(list[idx], a)) {
      return idx;
    }
    idx += 1;
  }
  return -1;
}

function _contains(a, list) {
  return _indexOf(list, a, 0) >= 0;
}

function _quote(s) {
  var escaped = s.replace(/\\/g, '\\\\').replace(/[\b]/g, '\\b') // \b matches word boundary; [\b] matches backspace
  .replace(/\f/g, '\\f').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/\v/g, '\\v').replace(/\0/g, '\\0');

  return '"' + escaped.replace(/"/g, '\\"') + '"';
}

/**
 * Polyfill from <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString>.
 */
var pad = function pad(n) {
  return (n < 10 ? '0' : '') + n;
};

var _toISOString = typeof Date.prototype.toISOString === 'function' ? function _toISOString(d) {
  return d.toISOString();
} : function _toISOString(d) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + '.' + (d.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5) + 'Z';
};

function _complement(f) {
  return function () {
    return !f.apply(this, arguments);
  };
}

function _filter(fn, list) {
  var idx = 0;
  var len = list.length;
  var result = [];

  while (idx < len) {
    if (fn(list[idx])) {
      result[result.length] = list[idx];
    }
    idx += 1;
  }
  return result;
}

function _isObject(x) {
  return Object.prototype.toString.call(x) === '[object Object]';
}

var XFilter = /*#__PURE__*/function () {
  function XFilter(f, xf) {
    this.xf = xf;
    this.f = f;
  }
  XFilter.prototype['@@transducer/init'] = _xfBase.init;
  XFilter.prototype['@@transducer/result'] = _xfBase.result;
  XFilter.prototype['@@transducer/step'] = function (result, input) {
    return this.f(input) ? this.xf['@@transducer/step'](result, input) : result;
  };

  return XFilter;
}();

var _xfilter = /*#__PURE__*/_curry2(function _xfilter(f, xf) {
  return new XFilter(f, xf);
});

/**
 * Takes a predicate and a `Filterable`, and returns a new filterable of the
 * same type containing the members of the given filterable which satisfy the
 * given predicate. Filterable objects include plain objects or any object
 * that has a filter method such as `Array`.
 *
 * Dispatches to the `filter` method of the second argument, if present.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig Filterable f => (a -> Boolean) -> f a -> f a
 * @param {Function} pred
 * @param {Array} filterable
 * @return {Array} Filterable
 * @see R.reject, R.transduce, R.addIndex
 * @example
 *
 *      var isEven = n => n % 2 === 0;
 *
 *      R.filter(isEven, [1, 2, 3, 4]); //=> [2, 4]
 *
 *      R.filter(isEven, {a: 1, b: 2, c: 3, d: 4}); //=> {b: 2, d: 4}
 */
var filter = /*#__PURE__*/_curry2( /*#__PURE__*/_dispatchable(['filter'], _xfilter, function (pred, filterable) {
  return _isObject(filterable) ? _reduce(function (acc, key) {
    if (pred(filterable[key])) {
      acc[key] = filterable[key];
    }
    return acc;
  }, {}, keys(filterable)) :
  // else
  _filter(pred, filterable);
}));

/**
 * The complement of [`filter`](#filter).
 *
 * Acts as a transducer if a transformer is given in list position. Filterable
 * objects include plain objects or any object that has a filter method such
 * as `Array`.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig Filterable f => (a -> Boolean) -> f a -> f a
 * @param {Function} pred
 * @param {Array} filterable
 * @return {Array}
 * @see R.filter, R.transduce, R.addIndex
 * @example
 *
 *      var isOdd = (n) => n % 2 === 1;
 *
 *      R.reject(isOdd, [1, 2, 3, 4]); //=> [2, 4]
 *
 *      R.reject(isOdd, {a: 1, b: 2, c: 3, d: 4}); //=> {b: 2, d: 4}
 */
var reject = /*#__PURE__*/_curry2(function reject(pred, filterable) {
  return filter(_complement(pred), filterable);
});

function _toString(x, seen) {
  var recur = function recur(y) {
    var xs = seen.concat([x]);
    return _contains(y, xs) ? '<Circular>' : _toString(y, xs);
  };

  //  mapPairs :: (Object, [String]) -> [String]
  var mapPairs = function (obj, keys$$1) {
    return _map(function (k) {
      return _quote(k) + ': ' + recur(obj[k]);
    }, keys$$1.slice().sort());
  };

  switch (Object.prototype.toString.call(x)) {
    case '[object Arguments]':
      return '(function() { return arguments; }(' + _map(recur, x).join(', ') + '))';
    case '[object Array]':
      return '[' + _map(recur, x).concat(mapPairs(x, reject(function (k) {
        return (/^\d+$/.test(k)
        );
      }, keys(x)))).join(', ') + ']';
    case '[object Boolean]':
      return typeof x === 'object' ? 'new Boolean(' + recur(x.valueOf()) + ')' : x.toString();
    case '[object Date]':
      return 'new Date(' + (isNaN(x.valueOf()) ? recur(NaN) : _quote(_toISOString(x))) + ')';
    case '[object Null]':
      return 'null';
    case '[object Number]':
      return typeof x === 'object' ? 'new Number(' + recur(x.valueOf()) + ')' : 1 / x === -Infinity ? '-0' : x.toString(10);
    case '[object String]':
      return typeof x === 'object' ? 'new String(' + recur(x.valueOf()) + ')' : _quote(x);
    case '[object Undefined]':
      return 'undefined';
    default:
      if (typeof x.toString === 'function') {
        var repr = x.toString();
        if (repr !== '[object Object]') {
          return repr;
        }
      }
      return '{' + mapPairs(x, keys(x)).join(', ') + '}';
  }
}

/**
 * Returns the string representation of the given value. `eval`'ing the output
 * should result in a value equivalent to the input value. Many of the built-in
 * `toString` methods do not satisfy this requirement.
 *
 * If the given value is an `[object Object]` with a `toString` method other
 * than `Object.prototype.toString`, this method is invoked with no arguments
 * to produce the return value. This means user-defined constructor functions
 * can provide a suitable `toString` method. For example:
 *
 *     function Point(x, y) {
 *       this.x = x;
 *       this.y = y;
 *     }
 *
 *     Point.prototype.toString = function() {
 *       return 'new Point(' + this.x + ', ' + this.y + ')';
 *     };
 *
 *     R.toString(new Point(1, 2)); //=> 'new Point(1, 2)'
 *
 * @func
 * @memberOf R
 * @since v0.14.0
 * @category String
 * @sig * -> String
 * @param {*} val
 * @return {String}
 * @example
 *
 *      R.toString(42); //=> '42'
 *      R.toString('abc'); //=> '"abc"'
 *      R.toString([1, 2, 3]); //=> '[1, 2, 3]'
 *      R.toString({foo: 1, bar: 2, baz: 3}); //=> '{"bar": 2, "baz": 3, "foo": 1}'
 *      R.toString(new Date('2001-02-03T04:05:06Z')); //=> 'new Date("2001-02-03T04:05:06.000Z")'
 */
var toString$1 = /*#__PURE__*/_curry1(function toString(val) {
  return _toString(val, []);
});

/**
 * Returns the result of concatenating the given lists or strings.
 *
 * Note: `R.concat` expects both arguments to be of the same type,
 * unlike the native `Array.prototype.concat` method. It will throw
 * an error if you `concat` an Array with a non-Array value.
 *
 * Dispatches to the `concat` method of the first argument, if present.
 * Can also concatenate two members of a [fantasy-land
 * compatible semigroup](https://github.com/fantasyland/fantasy-land#semigroup).
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig [a] -> [a] -> [a]
 * @sig String -> String -> String
 * @param {Array|String} firstList The first list
 * @param {Array|String} secondList The second list
 * @return {Array|String} A list consisting of the elements of `firstList` followed by the elements of
 * `secondList`.
 *
 * @example
 *
 *      R.concat('ABC', 'DEF'); // 'ABCDEF'
 *      R.concat([4, 5, 6], [1, 2, 3]); //=> [4, 5, 6, 1, 2, 3]
 *      R.concat([], []); //=> []
 */
var concat = /*#__PURE__*/_curry2(function concat(a, b) {
  if (_isArray(a)) {
    if (_isArray(b)) {
      return a.concat(b);
    }
    throw new TypeError(toString$1(b) + ' is not an array');
  }
  if (_isString(a)) {
    if (_isString(b)) {
      return a + b;
    }
    throw new TypeError(toString$1(b) + ' is not a string');
  }
  if (a != null && _isFunction(a['fantasy-land/concat'])) {
    return a['fantasy-land/concat'](b);
  }
  if (a != null && _isFunction(a.concat)) {
    return a.concat(b);
  }
  throw new TypeError(toString$1(a) + ' does not have a method named "concat" or "fantasy-land/concat"');
});

/**
 * Accepts a converging function and a list of branching functions and returns
 * a new function. When invoked, this new function is applied to some
 * arguments, each branching function is applied to those same arguments. The
 * results of each branching function are passed as arguments to the converging
 * function to produce the return value.
 *
 * @func
 * @memberOf R
 * @since v0.4.2
 * @category Function
 * @sig ((x1, x2, ...) -> z) -> [((a, b, ...) -> x1), ((a, b, ...) -> x2), ...] -> (a -> b -> ... -> z)
 * @param {Function} after A function. `after` will be invoked with the return values of
 *        `fn1` and `fn2` as its arguments.
 * @param {Array} functions A list of functions.
 * @return {Function} A new function.
 * @see R.useWith
 * @example
 *
 *      var average = R.converge(R.divide, [R.sum, R.length])
 *      average([1, 2, 3, 4, 5, 6, 7]) //=> 4
 *
 *      var strangeConcat = R.converge(R.concat, [R.toUpper, R.toLower])
 *      strangeConcat("Yodel") //=> "YODELyodel"
 *
 * @symb R.converge(f, [g, h])(a, b) = f(g(a, b), h(a, b))
 */
var converge = /*#__PURE__*/_curry2(function converge(after, fns) {
  return curryN(reduce(max, 0, pluck('length', fns)), function () {
    var args = arguments;
    var context = this;
    return after.apply(context, _map(function (fn) {
      return fn.apply(context, args);
    }, fns));
  });
});

var XReduceBy = /*#__PURE__*/function () {
  function XReduceBy(valueFn, valueAcc, keyFn, xf) {
    this.valueFn = valueFn;
    this.valueAcc = valueAcc;
    this.keyFn = keyFn;
    this.xf = xf;
    this.inputs = {};
  }
  XReduceBy.prototype['@@transducer/init'] = _xfBase.init;
  XReduceBy.prototype['@@transducer/result'] = function (result) {
    var key;
    for (key in this.inputs) {
      if (_has(key, this.inputs)) {
        result = this.xf['@@transducer/step'](result, this.inputs[key]);
        if (result['@@transducer/reduced']) {
          result = result['@@transducer/value'];
          break;
        }
      }
    }
    this.inputs = null;
    return this.xf['@@transducer/result'](result);
  };
  XReduceBy.prototype['@@transducer/step'] = function (result, input) {
    var key = this.keyFn(input);
    this.inputs[key] = this.inputs[key] || [key, this.valueAcc];
    this.inputs[key][1] = this.valueFn(this.inputs[key][1], input);
    return result;
  };

  return XReduceBy;
}();

var _xreduceBy = /*#__PURE__*/_curryN(4, [], function _xreduceBy(valueFn, valueAcc, keyFn, xf) {
  return new XReduceBy(valueFn, valueAcc, keyFn, xf);
});

/**
 * Groups the elements of the list according to the result of calling
 * the String-returning function `keyFn` on each element and reduces the elements
 * of each group to a single value via the reducer function `valueFn`.
 *
 * This function is basically a more general [`groupBy`](#groupBy) function.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.20.0
 * @category List
 * @sig ((a, b) -> a) -> a -> (b -> String) -> [b] -> {String: a}
 * @param {Function} valueFn The function that reduces the elements of each group to a single
 *        value. Receives two values, accumulator for a particular group and the current element.
 * @param {*} acc The (initial) accumulator value for each group.
 * @param {Function} keyFn The function that maps the list's element into a key.
 * @param {Array} list The array to group.
 * @return {Object} An object with the output of `keyFn` for keys, mapped to the output of
 *         `valueFn` for elements which produced that key when passed to `keyFn`.
 * @see R.groupBy, R.reduce
 * @example
 *
 *      var reduceToNamesBy = R.reduceBy((acc, student) => acc.concat(student.name), []);
 *      var namesByGrade = reduceToNamesBy(function(student) {
 *        var score = student.score;
 *        return score < 65 ? 'F' :
 *               score < 70 ? 'D' :
 *               score < 80 ? 'C' :
 *               score < 90 ? 'B' : 'A';
 *      });
 *      var students = [{name: 'Lucy', score: 92},
 *                      {name: 'Drew', score: 85},
 *                      // ...
 *                      {name: 'Bart', score: 62}];
 *      namesByGrade(students);
 *      // {
 *      //   'A': ['Lucy'],
 *      //   'B': ['Drew']
 *      //   // ...,
 *      //   'F': ['Bart']
 *      // }
 */
var reduceBy = /*#__PURE__*/_curryN(4, [], /*#__PURE__*/_dispatchable([], _xreduceBy, function reduceBy(valueFn, valueAcc, keyFn, list) {
  return _reduce(function (acc, elt) {
    var key = keyFn(elt);
    acc[key] = valueFn(_has(key, acc) ? acc[key] : valueAcc, elt);
    return acc;
  }, {}, list);
}));

/**
 * Counts the elements of a list according to how many match each value of a
 * key generated by the supplied function. Returns an object mapping the keys
 * produced by `fn` to the number of occurrences in the list. Note that all
 * keys are coerced to strings because of how JavaScript objects work.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Relation
 * @sig (a -> String) -> [a] -> {*}
 * @param {Function} fn The function used to map values to keys.
 * @param {Array} list The list to count elements from.
 * @return {Object} An object mapping keys to number of occurrences in the list.
 * @example
 *
 *      var numbers = [1.0, 1.1, 1.2, 2.0, 3.0, 2.2];
 *      R.countBy(Math.floor)(numbers);    //=> {'1': 3, '2': 2, '3': 1}
 *
 *      var letters = ['a', 'b', 'A', 'a', 'B', 'c'];
 *      R.countBy(R.toLower)(letters);   //=> {'a': 3, 'b': 2, 'c': 1}
 */
var countBy = /*#__PURE__*/reduceBy(function (acc, elem) {
  return acc + 1;
}, 0);

/**
 * Decrements its argument.
 *
 * @func
 * @memberOf R
 * @since v0.9.0
 * @category Math
 * @sig Number -> Number
 * @param {Number} n
 * @return {Number} n - 1
 * @see R.inc
 * @example
 *
 *      R.dec(42); //=> 41
 */
var dec = /*#__PURE__*/add(-1);

/**
 * Returns a new copy of the array with the element at the provided index
 * replaced with the given value.
 *
 * @func
 * @memberOf R
 * @since v0.14.0
 * @category List
 * @sig Number -> a -> [a] -> [a]
 * @param {Number} idx The index to update.
 * @param {*} x The value to exist at the given index of the returned array.
 * @param {Array|Arguments} list The source array-like object to be updated.
 * @return {Array} A copy of `list` with the value at index `idx` replaced with `x`.
 * @see R.adjust
 * @example
 *
 *      R.update(1, 11, [0, 1, 2]);     //=> [0, 11, 2]
 *      R.update(1)(11)([0, 1, 2]);     //=> [0, 11, 2]
 * @symb R.update(-1, a, [b, c]) = [b, a]
 * @symb R.update(0, a, [b, c]) = [a, c]
 * @symb R.update(1, a, [b, c]) = [b, a]
 */
var update = /*#__PURE__*/_curry3(function update(idx, x, list) {
  return adjust(always(x), idx, list);
});

var XDropRepeatsWith = /*#__PURE__*/function () {
  function XDropRepeatsWith(pred, xf) {
    this.xf = xf;
    this.pred = pred;
    this.lastValue = undefined;
    this.seenFirstValue = false;
  }

  XDropRepeatsWith.prototype['@@transducer/init'] = _xfBase.init;
  XDropRepeatsWith.prototype['@@transducer/result'] = _xfBase.result;
  XDropRepeatsWith.prototype['@@transducer/step'] = function (result, input) {
    var sameAsLast = false;
    if (!this.seenFirstValue) {
      this.seenFirstValue = true;
    } else if (this.pred(this.lastValue, input)) {
      sameAsLast = true;
    }
    this.lastValue = input;
    return sameAsLast ? result : this.xf['@@transducer/step'](result, input);
  };

  return XDropRepeatsWith;
}();

var _xdropRepeatsWith = /*#__PURE__*/_curry2(function _xdropRepeatsWith(pred, xf) {
  return new XDropRepeatsWith(pred, xf);
});

/**
 * Returns the nth element of the given list or string. If n is negative the
 * element at index length + n is returned.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig Number -> [a] -> a | Undefined
 * @sig Number -> String -> String
 * @param {Number} offset
 * @param {*} list
 * @return {*}
 * @example
 *
 *      var list = ['foo', 'bar', 'baz', 'quux'];
 *      R.nth(1, list); //=> 'bar'
 *      R.nth(-1, list); //=> 'quux'
 *      R.nth(-99, list); //=> undefined
 *
 *      R.nth(2, 'abc'); //=> 'c'
 *      R.nth(3, 'abc'); //=> ''
 * @symb R.nth(-1, [a, b, c]) = c
 * @symb R.nth(0, [a, b, c]) = a
 * @symb R.nth(1, [a, b, c]) = b
 */
var nth = /*#__PURE__*/_curry2(function nth(offset, list) {
  var idx = offset < 0 ? list.length + offset : offset;
  return _isString(list) ? list.charAt(idx) : list[idx];
});

/**
 * Returns the last element of the given list or string.
 *
 * @func
 * @memberOf R
 * @since v0.1.4
 * @category List
 * @sig [a] -> a | Undefined
 * @sig String -> String
 * @param {*} list
 * @return {*}
 * @see R.init, R.head, R.tail
 * @example
 *
 *      R.last(['fi', 'fo', 'fum']); //=> 'fum'
 *      R.last([]); //=> undefined
 *
 *      R.last('abc'); //=> 'c'
 *      R.last(''); //=> ''
 */
var last = /*#__PURE__*/nth(-1);

/**
 * Returns a new list without any consecutively repeating elements. Equality is
 * determined by applying the supplied predicate to each pair of consecutive elements. The
 * first element in a series of equal elements will be preserved.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.14.0
 * @category List
 * @sig ((a, a) -> Boolean) -> [a] -> [a]
 * @param {Function} pred A predicate used to test whether two items are equal.
 * @param {Array} list The array to consider.
 * @return {Array} `list` without repeating elements.
 * @see R.transduce
 * @example
 *
 *      var l = [1, -1, 1, 3, 4, -4, -4, -5, 5, 3, 3];
 *      R.dropRepeatsWith(R.eqBy(Math.abs), l); //=> [1, 3, 4, -5, 3]
 */
var dropRepeatsWith = /*#__PURE__*/_curry2( /*#__PURE__*/_dispatchable([], _xdropRepeatsWith, function dropRepeatsWith(pred, list) {
  var result = [];
  var idx = 1;
  var len = list.length;
  if (len !== 0) {
    result[0] = list[0];
    while (idx < len) {
      if (!pred(last(result), list[idx])) {
        result[result.length] = list[idx];
      }
      idx += 1;
    }
  }
  return result;
}));

/**
 * Returns a new list without any consecutively repeating elements.
 * [`R.equals`](#equals) is used to determine equality.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.14.0
 * @category List
 * @sig [a] -> [a]
 * @param {Array} list The array to consider.
 * @return {Array} `list` without repeating elements.
 * @see R.transduce
 * @example
 *
 *     R.dropRepeats([1, 1, 1, 2, 3, 4, 4, 2, 2]); //=> [1, 2, 3, 4, 2]
 */
var dropRepeats = /*#__PURE__*/_curry1( /*#__PURE__*/_dispatchable([], /*#__PURE__*/_xdropRepeatsWith(equals), /*#__PURE__*/dropRepeatsWith(equals)));

/**
 * Returns a new function much like the supplied one, except that the first two
 * arguments' order is reversed.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig ((a, b, c, ...) -> z) -> (b -> a -> c -> ... -> z)
 * @param {Function} fn The function to invoke with its first two parameters reversed.
 * @return {*} The result of invoking `fn` with its first two parameters' order reversed.
 * @example
 *
 *      var mergeThree = (a, b, c) => [].concat(a, b, c);
 *
 *      mergeThree(1, 2, 3); //=> [1, 2, 3]
 *
 *      R.flip(mergeThree)(1, 2, 3); //=> [2, 1, 3]
 * @symb R.flip(f)(a, b, c) = f(b, a, c)
 */
var flip = /*#__PURE__*/_curry1(function flip(fn) {
  return curryN(fn.length, function (a, b) {
    var args = Array.prototype.slice.call(arguments, 0);
    args[0] = b;
    args[1] = a;
    return fn.apply(this, args);
  });
});

/**
 * Splits a list into sub-lists stored in an object, based on the result of
 * calling a String-returning function on each element, and grouping the
 * results according to values returned.
 *
 * Dispatches to the `groupBy` method of the second argument, if present.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig (a -> String) -> [a] -> {String: [a]}
 * @param {Function} fn Function :: a -> String
 * @param {Array} list The array to group
 * @return {Object} An object with the output of `fn` for keys, mapped to arrays of elements
 *         that produced that key when passed to `fn`.
 * @see R.transduce
 * @example
 *
 *      var byGrade = R.groupBy(function(student) {
 *        var score = student.score;
 *        return score < 65 ? 'F' :
 *               score < 70 ? 'D' :
 *               score < 80 ? 'C' :
 *               score < 90 ? 'B' : 'A';
 *      });
 *      var students = [{name: 'Abby', score: 84},
 *                      {name: 'Eddy', score: 58},
 *                      // ...
 *                      {name: 'Jack', score: 69}];
 *      byGrade(students);
 *      // {
 *      //   'A': [{name: 'Dianne', score: 99}],
 *      //   'B': [{name: 'Abby', score: 84}]
 *      //   // ...,
 *      //   'F': [{name: 'Eddy', score: 58}]
 *      // }
 */
var groupBy = /*#__PURE__*/_curry2( /*#__PURE__*/_checkForMethod('groupBy', /*#__PURE__*/reduceBy(function (acc, item) {
  if (acc == null) {
    acc = [];
  }
  acc.push(item);
  return acc;
}, null)));

/**
 * Returns the first element of the given list or string. In some libraries
 * this function is named `first`.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig [a] -> a | Undefined
 * @sig String -> String
 * @param {Array|String} list
 * @return {*}
 * @see R.tail, R.init, R.last
 * @example
 *
 *      R.head(['fi', 'fo', 'fum']); //=> 'fi'
 *      R.head([]); //=> undefined
 *
 *      R.head('abc'); //=> 'a'
 *      R.head(''); //=> ''
 */
var head = /*#__PURE__*/nth(0);

function _identity(x) {
  return x;
}

/**
 * A function that does nothing but return the parameter supplied to it. Good
 * as a default or placeholder function.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig a -> a
 * @param {*} x The value to return.
 * @return {*} The input value, `x`.
 * @example
 *
 *      R.identity(1); //=> 1
 *
 *      var obj = {};
 *      R.identity(obj) === obj; //=> true
 * @symb R.identity(a) = a
 */
var identity = /*#__PURE__*/_curry1(_identity);

/**
 * Increments its argument.
 *
 * @func
 * @memberOf R
 * @since v0.9.0
 * @category Math
 * @sig Number -> Number
 * @param {Number} n
 * @return {Number} n + 1
 * @see R.dec
 * @example
 *
 *      R.inc(42); //=> 43
 */
var inc = /*#__PURE__*/add(1);

/**
 * Given a function that generates a key, turns a list of objects into an
 * object indexing the objects by the given key. Note that if multiple
 * objects generate the same value for the indexing key only the last value
 * will be included in the generated object.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.19.0
 * @category List
 * @sig (a -> String) -> [{k: v}] -> {k: {k: v}}
 * @param {Function} fn Function :: a -> String
 * @param {Array} array The array of objects to index
 * @return {Object} An object indexing each array element by the given property.
 * @example
 *
 *      var list = [{id: 'xyz', title: 'A'}, {id: 'abc', title: 'B'}];
 *      R.indexBy(R.prop('id'), list);
 *      //=> {abc: {id: 'abc', title: 'B'}, xyz: {id: 'xyz', title: 'A'}}
 */
var indexBy = /*#__PURE__*/reduceBy(function (acc, elem) {
  return elem;
}, null);

/**
 * Returns all but the last element of the given list or string.
 *
 * @func
 * @memberOf R
 * @since v0.9.0
 * @category List
 * @sig [a] -> [a]
 * @sig String -> String
 * @param {*} list
 * @return {*}
 * @see R.last, R.head, R.tail
 * @example
 *
 *      R.init([1, 2, 3]);  //=> [1, 2]
 *      R.init([1, 2]);     //=> [1]
 *      R.init([1]);        //=> []
 *      R.init([]);         //=> []
 *
 *      R.init('abc');  //=> 'ab'
 *      R.init('ab');   //=> 'a'
 *      R.init('a');    //=> ''
 *      R.init('');     //=> ''
 */
var init = /*#__PURE__*/slice(0, -1);

var _Set = /*#__PURE__*/function () {
  function _Set() {
    /* globals Set */
    this._nativeSet = typeof Set === 'function' ? new Set() : null;
    this._items = {};
  }

  // until we figure out why jsdoc chokes on this
  // @param item The item to add to the Set
  // @returns {boolean} true if the item did not exist prior, otherwise false
  //
  _Set.prototype.add = function (item) {
    return !hasOrAdd(item, true, this);
  };

  //
  // @param item The item to check for existence in the Set
  // @returns {boolean} true if the item exists in the Set, otherwise false
  //
  _Set.prototype.has = function (item) {
    return hasOrAdd(item, false, this);
  };

  //
  // Combines the logic for checking whether an item is a member of the set and
  // for adding a new item to the set.
  //
  // @param item       The item to check or add to the Set instance.
  // @param shouldAdd  If true, the item will be added to the set if it doesn't
  //                   already exist.
  // @param set        The set instance to check or add to.
  // @return {boolean} true if the item already existed, otherwise false.
  //
  return _Set;
}();

function hasOrAdd(item, shouldAdd, set) {
  var type = typeof item;
  var prevSize, newSize;
  switch (type) {
    case 'string':
    case 'number':
      // distinguish between +0 and -0
      if (item === 0 && 1 / item === -Infinity) {
        if (set._items['-0']) {
          return true;
        } else {
          if (shouldAdd) {
            set._items['-0'] = true;
          }
          return false;
        }
      }
      // these types can all utilise the native Set
      if (set._nativeSet !== null) {
        if (shouldAdd) {
          prevSize = set._nativeSet.size;
          set._nativeSet.add(item);
          newSize = set._nativeSet.size;
          return newSize === prevSize;
        } else {
          return set._nativeSet.has(item);
        }
      } else {
        if (!(type in set._items)) {
          if (shouldAdd) {
            set._items[type] = {};
            set._items[type][item] = true;
          }
          return false;
        } else if (item in set._items[type]) {
          return true;
        } else {
          if (shouldAdd) {
            set._items[type][item] = true;
          }
          return false;
        }
      }

    case 'boolean':
      // set._items['boolean'] holds a two element array
      // representing [ falseExists, trueExists ]
      if (type in set._items) {
        var bIdx = item ? 1 : 0;
        if (set._items[type][bIdx]) {
          return true;
        } else {
          if (shouldAdd) {
            set._items[type][bIdx] = true;
          }
          return false;
        }
      } else {
        if (shouldAdd) {
          set._items[type] = item ? [false, true] : [true, false];
        }
        return false;
      }

    case 'function':
      // compare functions for reference equality
      if (set._nativeSet !== null) {
        if (shouldAdd) {
          prevSize = set._nativeSet.size;
          set._nativeSet.add(item);
          newSize = set._nativeSet.size;
          return newSize === prevSize;
        } else {
          return set._nativeSet.has(item);
        }
      } else {
        if (!(type in set._items)) {
          if (shouldAdd) {
            set._items[type] = [item];
          }
          return false;
        }
        if (!_contains(item, set._items[type])) {
          if (shouldAdd) {
            set._items[type].push(item);
          }
          return false;
        }
        return true;
      }

    case 'undefined':
      if (set._items[type]) {
        return true;
      } else {
        if (shouldAdd) {
          set._items[type] = true;
        }
        return false;
      }

    case 'object':
      if (item === null) {
        if (!set._items['null']) {
          if (shouldAdd) {
            set._items['null'] = true;
          }
          return false;
        }
        return true;
      }
    /* falls through */
    default:
      // reduce the search size of heterogeneous sets by creating buckets
      // for each type.
      type = Object.prototype.toString.call(item);
      if (!(type in set._items)) {
        if (shouldAdd) {
          set._items[type] = [item];
        }
        return false;
      }
      // scan through all previously applied items
      if (!_contains(item, set._items[type])) {
        if (shouldAdd) {
          set._items[type].push(item);
        }
        return false;
      }
      return true;
  }
}

/**
 * Returns a new list containing only one copy of each element in the original
 * list, based upon the value returned by applying the supplied function to
 * each list element. Prefers the first item if the supplied function produces
 * the same value on two items. [`R.equals`](#equals) is used for comparison.
 *
 * @func
 * @memberOf R
 * @since v0.16.0
 * @category List
 * @sig (a -> b) -> [a] -> [a]
 * @param {Function} fn A function used to produce a value to use during comparisons.
 * @param {Array} list The array to consider.
 * @return {Array} The list of unique items.
 * @example
 *
 *      R.uniqBy(Math.abs, [-1, -5, 2, 10, 1, 2]); //=> [-1, -5, 2, 10]
 */
var uniqBy = /*#__PURE__*/_curry2(function uniqBy(fn, list) {
  var set = new _Set();
  var result = [];
  var idx = 0;
  var appliedItem, item;

  while (idx < list.length) {
    item = list[idx];
    appliedItem = fn(item);
    if (set.add(appliedItem)) {
      result.push(item);
    }
    idx += 1;
  }
  return result;
});

/**
 * Returns a new list containing only one copy of each element in the original
 * list. [`R.equals`](#equals) is used to determine equality.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig [a] -> [a]
 * @param {Array} list The array to consider.
 * @return {Array} The list of unique items.
 * @example
 *
 *      R.uniq([1, 1, 2, 1]); //=> [1, 2]
 *      R.uniq([1, '1']);     //=> [1, '1']
 *      R.uniq([[42], [42]]); //=> [[42]]
 */
var uniq = /*#__PURE__*/uniqBy(identity);

// Based on https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
function _objectAssign(target) {
  if (target == null) {
    throw new TypeError('Cannot convert undefined or null to object');
  }

  var output = Object(target);
  var idx = 1;
  var length = arguments.length;
  while (idx < length) {
    var source = arguments[idx];
    if (source != null) {
      for (var nextKey in source) {
        if (_has(nextKey, source)) {
          output[nextKey] = source[nextKey];
        }
      }
    }
    idx += 1;
  }
  return output;
}

var _assign = typeof Object.assign === 'function' ? Object.assign : _objectAssign;

/**
 * Turns a named method with a specified arity into a function that can be
 * called directly supplied with arguments and a target object.
 *
 * The returned function is curried and accepts `arity + 1` parameters where
 * the final parameter is the target object.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig Number -> String -> (a -> b -> ... -> n -> Object -> *)
 * @param {Number} arity Number of arguments the returned function should take
 *        before the target object.
 * @param {String} method Name of the method to call.
 * @return {Function} A new curried function.
 * @see R.construct
 * @example
 *
 *      var sliceFrom = R.invoker(1, 'slice');
 *      sliceFrom(6, 'abcdefghijklm'); //=> 'ghijklm'
 *      var sliceFrom6 = R.invoker(2, 'slice')(6);
 *      sliceFrom6(8, 'abcdefghijklm'); //=> 'gh'
 * @symb R.invoker(0, 'method')(o) = o['method']()
 * @symb R.invoker(1, 'method')(a, o) = o['method'](a)
 * @symb R.invoker(2, 'method')(a, b, o) = o['method'](a, b)
 */
var invoker = /*#__PURE__*/_curry2(function invoker(arity, method) {
  return curryN(arity + 1, function () {
    var target = arguments[arity];
    if (target != null && _isFunction(target[method])) {
      return target[method].apply(target, Array.prototype.slice.call(arguments, 0, arity));
    }
    throw new TypeError(toString$1(target) + ' does not have a method named "' + method + '"');
  });
});

/**
 * Returns a string made by inserting the `separator` between each element and
 * concatenating all the elements into a single string.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig String -> [a] -> String
 * @param {Number|String} separator The string used to separate the elements.
 * @param {Array} xs The elements to join into a string.
 * @return {String} str The string made by concatenating `xs` with `separator`.
 * @see R.split
 * @example
 *
 *      var spacer = R.join(' ');
 *      spacer(['a', 2, 3.4]);   //=> 'a 2 3.4'
 *      R.join('|', [1, 2, 3]);    //=> '1|2|3'
 */
var join = /*#__PURE__*/invoker(1, 'join');

/**
 * juxt applies a list of functions to a list of values.
 *
 * @func
 * @memberOf R
 * @since v0.19.0
 * @category Function
 * @sig [(a, b, ..., m) -> n] -> ((a, b, ..., m) -> [n])
 * @param {Array} fns An array of functions
 * @return {Function} A function that returns a list of values after applying each of the original `fns` to its parameters.
 * @see R.applySpec
 * @example
 *
 *      var getRange = R.juxt([Math.min, Math.max]);
 *      getRange(3, 4, 9, -3); //=> [-3, 9]
 * @symb R.juxt([f, g, h])(a, b) = [f(a, b), g(a, b), h(a, b)]
 */
var juxt = /*#__PURE__*/_curry1(function juxt(fns) {
  return converge(function () {
    return Array.prototype.slice.call(arguments, 0);
  }, fns);
});

function _isNumber(x) {
  return Object.prototype.toString.call(x) === '[object Number]';
}

/**
 * Returns the number of elements in the array by returning `list.length`.
 *
 * @func
 * @memberOf R
 * @since v0.3.0
 * @category List
 * @sig [a] -> Number
 * @param {Array} list The array to inspect.
 * @return {Number} The length of the array.
 * @example
 *
 *      R.length([]); //=> 0
 *      R.length([1, 2, 3]); //=> 3
 */
var length = /*#__PURE__*/_curry1(function length(list) {
  return list != null && _isNumber(list.length) ? list.length : NaN;
});

/**
 * Adds together all the elements of a list.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Math
 * @sig [Number] -> Number
 * @param {Array} list An array of numbers
 * @return {Number} The sum of all the numbers in the list.
 * @see R.reduce
 * @example
 *
 *      R.sum([2,4,6,8,100,1]); //=> 121
 */
var sum = /*#__PURE__*/reduce(add, 0);

/**
 * A customisable version of [`R.memoize`](#memoize). `memoizeWith` takes an
 * additional function that will be applied to a given argument set and used to
 * create the cache key under which the results of the function to be memoized
 * will be stored. Care must be taken when implementing key generation to avoid
 * clashes that may overwrite previous entries erroneously.
 *
 *
 * @func
 * @memberOf R
 * @since v0.24.0
 * @category Function
 * @sig (*... -> String) -> (*... -> a) -> (*... -> a)
 * @param {Function} fn The function to generate the cache key.
 * @param {Function} fn The function to memoize.
 * @return {Function} Memoized version of `fn`.
 * @see R.memoize
 * @example
 *
 *      let count = 0;
 *      const factorial = R.memoizeWith(R.identity, n => {
 *        count += 1;
 *        return R.product(R.range(1, n + 1));
 *      });
 *      factorial(5); //=> 120
 *      factorial(5); //=> 120
 *      factorial(5); //=> 120
 *      count; //=> 1
 */
var memoizeWith = /*#__PURE__*/_curry2(function memoizeWith(mFn, fn) {
  var cache = {};
  return _arity(fn.length, function () {
    var key = mFn.apply(this, arguments);
    if (!_has(key, cache)) {
      cache[key] = fn.apply(this, arguments);
    }
    return cache[key];
  });
});

/**
 * Creates a new function that, when invoked, caches the result of calling `fn`
 * for a given argument set and returns the result. Subsequent calls to the
 * memoized `fn` with the same argument set will not result in an additional
 * call to `fn`; instead, the cached result for that set of arguments will be
 * returned.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig (*... -> a) -> (*... -> a)
 * @param {Function} fn The function to memoize.
 * @return {Function} Memoized version of `fn`.
 * @see R.memoizeWith
 * @deprecated since v0.25.0
 * @example
 *
 *      let count = 0;
 *      const factorial = R.memoize(n => {
 *        count += 1;
 *        return R.product(R.range(1, n + 1));
 *      });
 *      factorial(5); //=> 120
 *      factorial(5); //=> 120
 *      factorial(5); //=> 120
 *      count; //=> 1
 */
var memoize = /*#__PURE__*/memoizeWith(function () {
  return toString$1(arguments);
});

/**
 * Create a new object with the own properties of the first object merged with
 * the own properties of the second object. If a key exists in both objects,
 * the value from the second object will be used.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Object
 * @sig {k: v} -> {k: v} -> {k: v}
 * @param {Object} l
 * @param {Object} r
 * @return {Object}
 * @see R.mergeDeepRight, R.mergeWith, R.mergeWithKey
 * @example
 *
 *      R.merge({ 'name': 'fred', 'age': 10 }, { 'age': 40 });
 *      //=> { 'name': 'fred', 'age': 40 }
 *
 *      var resetToDefault = R.merge(R.__, {x: 0});
 *      resetToDefault({x: 5, y: 2}); //=> {x: 0, y: 2}
 * @symb R.merge({ x: 1, y: 2 }, { y: 5, z: 3 }) = { x: 1, y: 5, z: 3 }
 */
var merge = /*#__PURE__*/_curry2(function merge(l, r) {
  return _assign({}, l, r);
});

/**
 * Returns the smaller of its two arguments.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Relation
 * @sig Ord a => a -> a -> a
 * @param {*} a
 * @param {*} b
 * @return {*}
 * @see R.minBy, R.max
 * @example
 *
 *      R.min(789, 123); //=> 123
 *      R.min('a', 'b'); //=> 'a'
 */
var min = /*#__PURE__*/_curry2(function min(a, b) {
  return b < a ? b : a;
});

/**
 * Multiplies two numbers. Equivalent to `a * b` but curried.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Math
 * @sig Number -> Number -> Number
 * @param {Number} a The first value.
 * @param {Number} b The second value.
 * @return {Number} The result of `a * b`.
 * @see R.divide
 * @example
 *
 *      var double = R.multiply(2);
 *      var triple = R.multiply(3);
 *      double(3);       //=>  6
 *      triple(4);       //=> 12
 *      R.multiply(2, 5);  //=> 10
 */
var multiply = /*#__PURE__*/_curry2(function multiply(a, b) {
  return a * b;
});

function _createPartialApplicator(concat) {
  return _curry2(function (fn, args) {
    return _arity(Math.max(0, fn.length - args.length), function () {
      return fn.apply(this, concat(args, arguments));
    });
  });
}

/**
 * Takes a function `f` and a list of arguments, and returns a function `g`.
 * When applied, `g` returns the result of applying `f` to the arguments
 * provided to `g` followed by the arguments provided initially.
 *
 * @func
 * @memberOf R
 * @since v0.10.0
 * @category Function
 * @sig ((a, b, c, ..., n) -> x) -> [d, e, f, ..., n] -> ((a, b, c, ...) -> x)
 * @param {Function} f
 * @param {Array} args
 * @return {Function}
 * @see R.partial
 * @example
 *
 *      var greet = (salutation, title, firstName, lastName) =>
 *        salutation + ', ' + title + ' ' + firstName + ' ' + lastName + '!';
 *
 *      var greetMsJaneJones = R.partialRight(greet, ['Ms.', 'Jane', 'Jones']);
 *
 *      greetMsJaneJones('Hello'); //=> 'Hello, Ms. Jane Jones!'
 * @symb R.partialRight(f, [a, b])(c, d) = f(c, d, a, b)
 */
var partialRight = /*#__PURE__*/_createPartialApplicator( /*#__PURE__*/flip(_concat));

/**
 * Takes a predicate and a list or other `Filterable` object and returns the
 * pair of filterable objects of the same type of elements which do and do not
 * satisfy, the predicate, respectively. Filterable objects include plain objects or any object
 * that has a filter method such as `Array`.
 *
 * @func
 * @memberOf R
 * @since v0.1.4
 * @category List
 * @sig Filterable f => (a -> Boolean) -> f a -> [f a, f a]
 * @param {Function} pred A predicate to determine which side the element belongs to.
 * @param {Array} filterable the list (or other filterable) to partition.
 * @return {Array} An array, containing first the subset of elements that satisfy the
 *         predicate, and second the subset of elements that do not satisfy.
 * @see R.filter, R.reject
 * @example
 *
 *      R.partition(R.contains('s'), ['sss', 'ttt', 'foo', 'bars']);
 *      // => [ [ 'sss', 'bars' ],  [ 'ttt', 'foo' ] ]
 *
 *      R.partition(R.contains('s'), { a: 'sss', b: 'ttt', foo: 'bars' });
 *      // => [ { a: 'sss', foo: 'bars' }, { b: 'ttt' }  ]
 */
var partition = /*#__PURE__*/juxt([filter, reject]);

/**
 * Similar to `pick` except that this one includes a `key: undefined` pair for
 * properties that don't exist.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Object
 * @sig [k] -> {k: v} -> {k: v}
 * @param {Array} names an array of String property names to copy onto a new object
 * @param {Object} obj The object to copy from
 * @return {Object} A new object with only properties from `names` on it.
 * @see R.pick
 * @example
 *
 *      R.pickAll(['a', 'd'], {a: 1, b: 2, c: 3, d: 4}); //=> {a: 1, d: 4}
 *      R.pickAll(['a', 'e', 'f'], {a: 1, b: 2, c: 3, d: 4}); //=> {a: 1, e: undefined, f: undefined}
 */
var pickAll = /*#__PURE__*/_curry2(function pickAll(names, obj) {
  var result = {};
  var idx = 0;
  var len = names.length;
  while (idx < len) {
    var name = names[idx];
    result[name] = obj[name];
    idx += 1;
  }
  return result;
});

/**
 * Multiplies together all the elements of a list.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Math
 * @sig [Number] -> Number
 * @param {Array} list An array of numbers
 * @return {Number} The product of all the numbers in the list.
 * @see R.reduce
 * @example
 *
 *      R.product([2,4,6,8,100,1]); //=> 38400
 */
var product = /*#__PURE__*/reduce(multiply, 1);

/**
 * Accepts a function `fn` and a list of transformer functions and returns a
 * new curried function. When the new function is invoked, it calls the
 * function `fn` with parameters consisting of the result of calling each
 * supplied handler on successive arguments to the new function.
 *
 * If more arguments are passed to the returned function than transformer
 * functions, those arguments are passed directly to `fn` as additional
 * parameters. If you expect additional arguments that don't need to be
 * transformed, although you can ignore them, it's best to pass an identity
 * function so that the new function reports the correct arity.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Function
 * @sig ((x1, x2, ...) -> z) -> [(a -> x1), (b -> x2), ...] -> (a -> b -> ... -> z)
 * @param {Function} fn The function to wrap.
 * @param {Array} transformers A list of transformer functions
 * @return {Function} The wrapped function.
 * @see R.converge
 * @example
 *
 *      R.useWith(Math.pow, [R.identity, R.identity])(3, 4); //=> 81
 *      R.useWith(Math.pow, [R.identity, R.identity])(3)(4); //=> 81
 *      R.useWith(Math.pow, [R.dec, R.inc])(3, 4); //=> 32
 *      R.useWith(Math.pow, [R.dec, R.inc])(3)(4); //=> 32
 * @symb R.useWith(f, [g, h])(a, b) = f(g(a), h(b))
 */
var useWith = /*#__PURE__*/_curry2(function useWith(fn, transformers) {
  return curryN(transformers.length, function () {
    var args = [];
    var idx = 0;
    while (idx < transformers.length) {
      args.push(transformers[idx].call(this, arguments[idx]));
      idx += 1;
    }
    return fn.apply(this, args.concat(Array.prototype.slice.call(arguments, transformers.length)));
  });
});

/**
 * Reasonable analog to SQL `select` statement.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Object
 * @category Relation
 * @sig [k] -> [{k: v}] -> [{k: v}]
 * @param {Array} props The property names to project
 * @param {Array} objs The objects to query
 * @return {Array} An array of objects with just the `props` properties.
 * @example
 *
 *      var abby = {name: 'Abby', age: 7, hair: 'blond', grade: 2};
 *      var fred = {name: 'Fred', age: 12, hair: 'brown', grade: 7};
 *      var kids = [abby, fred];
 *      R.project(['name', 'grade'], kids); //=> [{name: 'Abby', grade: 2}, {name: 'Fred', grade: 7}]
 */
var project = /*#__PURE__*/useWith(_map, [pickAll, identity]); // passing `identity` gives correct arity

/**
 * Splits a string into an array of strings based on the given
 * separator.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category String
 * @sig (String | RegExp) -> String -> [String]
 * @param {String|RegExp} sep The pattern.
 * @param {String} str The string to separate into an array.
 * @return {Array} The array of strings from `str` separated by `str`.
 * @see R.join
 * @example
 *
 *      var pathComponents = R.split('/');
 *      R.tail(pathComponents('/usr/local/bin/node')); //=> ['usr', 'local', 'bin', 'node']
 *
 *      R.split('.', 'a.b.c.xyz.d'); //=> ['a', 'b', 'c', 'xyz', 'd']
 */
var split = /*#__PURE__*/invoker(1, 'split');

/**
 * Splits a collection into slices of the specified length.
 *
 * @func
 * @memberOf R
 * @since v0.16.0
 * @category List
 * @sig Number -> [a] -> [[a]]
 * @sig Number -> String -> [String]
 * @param {Number} n
 * @param {Array} list
 * @return {Array}
 * @example
 *
 *      R.splitEvery(3, [1, 2, 3, 4, 5, 6, 7]); //=> [[1, 2, 3], [4, 5, 6], [7]]
 *      R.splitEvery(3, 'foobarbaz'); //=> ['foo', 'bar', 'baz']
 */
var splitEvery = /*#__PURE__*/_curry2(function splitEvery(n, list) {
  if (n <= 0) {
    throw new Error('First argument to splitEvery must be a positive integer');
  }
  var result = [];
  var idx = 0;
  while (idx < list.length) {
    result.push(slice(idx, idx += n, list));
  }
  return result;
});

var XTakeWhile = /*#__PURE__*/function () {
  function XTakeWhile(f, xf) {
    this.xf = xf;
    this.f = f;
  }
  XTakeWhile.prototype['@@transducer/init'] = _xfBase.init;
  XTakeWhile.prototype['@@transducer/result'] = _xfBase.result;
  XTakeWhile.prototype['@@transducer/step'] = function (result, input) {
    return this.f(input) ? this.xf['@@transducer/step'](result, input) : _reduced(result);
  };

  return XTakeWhile;
}();

var _xtakeWhile = /*#__PURE__*/_curry2(function _xtakeWhile(f, xf) {
  return new XTakeWhile(f, xf);
});

/**
 * Returns a new list containing the first `n` elements of a given list,
 * passing each value to the supplied predicate function, and terminating when
 * the predicate function returns `false`. Excludes the element that caused the
 * predicate function to fail. The predicate function is passed one argument:
 * *(value)*.
 *
 * Dispatches to the `takeWhile` method of the second argument, if present.
 *
 * Acts as a transducer if a transformer is given in list position.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category List
 * @sig (a -> Boolean) -> [a] -> [a]
 * @sig (a -> Boolean) -> String -> String
 * @param {Function} fn The function called per iteration.
 * @param {Array} xs The collection to iterate over.
 * @return {Array} A new array.
 * @see R.dropWhile, R.transduce, R.addIndex
 * @example
 *
 *      var isNotFour = x => x !== 4;
 *
 *      R.takeWhile(isNotFour, [1, 2, 3, 4, 3, 2, 1]); //=> [1, 2, 3]
 *
 *      R.takeWhile(x => x !== 'd' , 'Ramda'); //=> 'Ram'
 */
var takeWhile = /*#__PURE__*/_curry2( /*#__PURE__*/_dispatchable(['takeWhile'], _xtakeWhile, function takeWhile(fn, xs) {
  var idx = 0;
  var len = xs.length;
  while (idx < len && fn(xs[idx])) {
    idx += 1;
  }
  return slice(0, idx, xs);
}));

/**
 * The lower case version of a string.
 *
 * @func
 * @memberOf R
 * @since v0.9.0
 * @category String
 * @sig String -> String
 * @param {String} str The string to lower case.
 * @return {String} The lower case version of `str`.
 * @see R.toUpper
 * @example
 *
 *      R.toLower('XYZ'); //=> 'xyz'
 */
var toLower = /*#__PURE__*/invoker(0, 'toLowerCase');

/**
 * The upper case version of a string.
 *
 * @func
 * @memberOf R
 * @since v0.9.0
 * @category String
 * @sig String -> String
 * @param {String} str The string to upper case.
 * @return {String} The upper case version of `str`.
 * @see R.toLower
 * @example
 *
 *      R.toUpper('abc'); //=> 'ABC'
 */
var toUpper = /*#__PURE__*/invoker(0, 'toUpperCase');

/**
 * Initializes a transducer using supplied iterator function. Returns a single
 * item by iterating through the list, successively calling the transformed
 * iterator function and passing it an accumulator value and the current value
 * from the array, and then passing the result to the next call.
 *
 * The iterator function receives two values: *(acc, value)*. It will be
 * wrapped as a transformer to initialize the transducer. A transformer can be
 * passed directly in place of an iterator function. In both cases, iteration
 * may be stopped early with the [`R.reduced`](#reduced) function.
 *
 * A transducer is a function that accepts a transformer and returns a
 * transformer and can be composed directly.
 *
 * A transformer is an an object that provides a 2-arity reducing iterator
 * function, step, 0-arity initial value function, init, and 1-arity result
 * extraction function, result. The step function is used as the iterator
 * function in reduce. The result function is used to convert the final
 * accumulator into the return type and in most cases is
 * [`R.identity`](#identity). The init function can be used to provide an
 * initial accumulator, but is ignored by transduce.
 *
 * The iteration is performed with [`R.reduce`](#reduce) after initializing the transducer.
 *
 * @func
 * @memberOf R
 * @since v0.12.0
 * @category List
 * @sig (c -> c) -> ((a, b) -> a) -> a -> [b] -> a
 * @param {Function} xf The transducer function. Receives a transformer and returns a transformer.
 * @param {Function} fn The iterator function. Receives two values, the accumulator and the
 *        current element from the array. Wrapped as transformer, if necessary, and used to
 *        initialize the transducer
 * @param {*} acc The initial accumulator value.
 * @param {Array} list The list to iterate over.
 * @return {*} The final, accumulated value.
 * @see R.reduce, R.reduced, R.into
 * @example
 *
 *      var numbers = [1, 2, 3, 4];
 *      var transducer = R.compose(R.map(R.add(1)), R.take(2));
 *      R.transduce(transducer, R.flip(R.append), [], numbers); //=> [2, 3]
 *
 *      var isOdd = (x) => x % 2 === 1;
 *      var firstOddTransducer = R.compose(R.filter(isOdd), R.take(1));
 *      R.transduce(firstOddTransducer, R.flip(R.append), [], R.range(0, 100)); //=> [1]
 */
var transduce = /*#__PURE__*/curryN(4, function transduce(xf, fn, acc, list) {
  return _reduce(xf(typeof fn === 'function' ? _xwrap(fn) : fn), acc, list);
});

var ws = '\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003' + '\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028' + '\u2029\uFEFF';
var zeroWidth = '\u200b';
var hasProtoTrim = typeof String.prototype.trim === 'function';
/**
 * Removes (strips) whitespace from both ends of the string.
 *
 * @func
 * @memberOf R
 * @since v0.6.0
 * @category String
 * @sig String -> String
 * @param {String} str The string to trim.
 * @return {String} Trimmed version of `str`.
 * @example
 *
 *      R.trim('   xyz  '); //=> 'xyz'
 *      R.map(R.trim, R.split(',', 'x, y, z')); //=> ['x', 'y', 'z']
 */
var _trim = !hasProtoTrim || /*#__PURE__*/ws.trim() || ! /*#__PURE__*/zeroWidth.trim() ? function trim(str) {
  var beginRx = new RegExp('^[' + ws + '][' + ws + ']*');
  var endRx = new RegExp('[' + ws + '][' + ws + ']*$');
  return str.replace(beginRx, '').replace(endRx, '');
} : function trim(str) {
  return str.trim();
};

/**
 * Combines two lists into a set (i.e. no duplicates) composed of the elements
 * of each list.
 *
 * @func
 * @memberOf R
 * @since v0.1.0
 * @category Relation
 * @sig [*] -> [*] -> [*]
 * @param {Array} as The first list.
 * @param {Array} bs The second list.
 * @return {Array} The first and second lists concatenated, with
 *         duplicates removed.
 * @example
 *
 *      R.union([1, 2, 3], [2, 3, 4]); //=> [1, 2, 3, 4]
 */
var union = /*#__PURE__*/_curry2( /*#__PURE__*/compose(uniq, _concat));

/**
 * Shorthand for `R.chain(R.identity)`, which removes one level of nesting from
 * any [Chain](https://github.com/fantasyland/fantasy-land#chain).
 *
 * @func
 * @memberOf R
 * @since v0.3.0
 * @category List
 * @sig Chain c => c (c a) -> c a
 * @param {*} list
 * @return {*}
 * @see R.flatten, R.chain
 * @example
 *
 *      R.unnest([1, [2], [[3]]]); //=> [1, 2, [3]]
 *      R.unnest([[1, 2], [3, 4], [5, 6]]); //=> [1, 2, 3, 4, 5, 6]
 */
var unnest = /*#__PURE__*/chain(_identity);

var texts = ["The Project Gutenberg EBook of Tao Teh King, by Lao-Tze\n", "This eBook is for the use of anyone anywhere at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org\n", "Title: Tao Teh King\n", "Author: Lao-Tze\n", "Posting Date: July 12, 2008 [EBook #216] Release Date: February, 1995\n", "Language: English\n", "START OF THIS PROJECT GUTENBERG EBOOK TAO TEH KING ***\n", "Produced by Gregory Walker\n", "THE TAO TEH KING,\n", "OR\n", "THE TAO AND ITS CHARACTERISTICS\n", "by Lao-Tse\n", "Translated by James Legge\n", "PART 1.\n", "Ch. 1. 1. The Tao that can be trodden is not the enduring and unchanging Tao. The name that can be named is not the enduring and unchanging name.\n", "Conceived of as) having no name, it is the Originator of heaven and earth; (conceived of as) having a name, it is the Mother of all things.\n", "Always without desire we must be found, If its deep mystery we would sound; But if desire always within us be, Its outer fringe is all that we shall see.\n", "Under these two aspects, it is really the same; but as development takes place, it receives the different names. Together we call them the Mystery. Where the Mystery is the deepest is the gate of all that is subtle and wonderful.\n", "All in the world know the beauty of the beautiful, and in doing this they have (the idea of) what ugliness is; they all know the skill of the skilful, and in doing this they have (the idea of) what the want of skill is.\n", "So it is that existence and non-existence give birth the one to (the idea of) the other; that difficulty and ease produce the one (the idea of) the other; that length and shortness fashion out the one the figure of the other; that (the ideas of) height and lowness arise from the contrast of the one with the other; that the musical notes and tones become harmonious through the relation of one with another; and that being before and behind give the idea of one following another.\n", "Therefore the sage manages affairs without doing anything, and conveys his instructions without the use of speech.\n", "All things spring up, and there is not one which declines to show itself; they grow, and there is no claim made for their ownership; they go through their processes, and there is no expectation (of a reward for the results). The work is accomplished, and there is no resting in it (as an achievement).\n", "The work is done, but how no one can see; 'Tis this that makes the power not cease to be.\n", "Not to value and employ men of superior ability is the way to keep the people from rivalry among themselves; not to prize articles which are difficult to procure is the way to keep them from becoming thieves; not to show them what is likely to excite their desires is the way to keep their minds from disorder.\n", "Therefore the sage, in the exercise of his government, empties their minds, fills their bellies, weakens their wills, and strengthens their bones.\n", "He constantly (tries to) keep them without knowledge and without desire, and where there are those who have knowledge, to keep them from presuming to act (on it). When there is this abstinence from action, good order is universal.\n", "The Tao is (like) the emptiness of a vessel; and in our employment of it we must be on our guard against all fulness. How deep and unfathomable it is, as if it were the Honoured Ancestor of all things!\n", "We should blunt our sharp points, and unravel the complications of things; we should attemper our brightness, and bring ourselves into agreement with the obscurity of others. How pure and still the Tao is, as if it would ever so continue!\n", "I do not know whose son it is. It might appear to have been before God.\n", "Heaven and earth do not act from (the impulse of) any wish to be benevolent; they deal with all things as the dogs of grass are dealt with. The sages do not act from (any wish to be) benevolent; they deal with the people as the dogs of grass are dealt with.\n", "May not the space between heaven and earth be compared to a bellows?\n", "Tis emptied, yet it loses not its power; 'Tis moved again, and sends forth air the more. Much speech to swift exhaustion lead we see; Your inner being guard, and keep it free.\n", "The valley spirit dies not, aye the same; The female mystery thus do we name. Its gate, from which at first they issued forth, Is called the root from which grew heaven and earth. Long and unbroken does its power remain, Used gently, and without the touch of pain.\n", "Heaven is long-enduring and earth continues long. The reason why heaven and earth are able to endure and continue thus long is because they do not live of, or for, themselves. This is how they are able to continue and endure.\n", "Therefore the sage puts his own person last, and yet it is found in the foremost place; he treats his person as if it were foreign to him, and yet that person is preserved. Is it not because he has no personal and private ends, that therefore such ends are realised?\n", "The highest excellence is like (that of) water. The excellence of water appears in its benefiting all things, and in its occupying, without striving (to the contrary), the low place which all men dislike. Hence (its way) is near to (that of) the Tao.\n", "The excellence of a residence is in (the suitability of) the place; that of the mind is in abysmal stillness; that of associations is in their being with the virtuous; that of government is in its securing good order; that of (the conduct of) affairs is in its ability; and that of (the initiation of) any movement is in its timeliness.\n", "And when (one with the highest excellence) does not wrangle (about his low position), no one finds fault with him.\n", "It is better to leave a vessel unfilled, than to attempt to carry it when it is full. If you keep feeling a point that has been sharpened, the point cannot long preserve its sharpness.\n", "When gold and jade fill the hall, their possessor cannot keep them safe. When wealth and honours lead to arrogancy, this brings its evil on itself. When the work is done, and one's name is becoming distinguished, to withdraw into obscurity is the way of Heaven.\n", "When the intelligent and animal souls are held together in one embrace, they can be kept from separating. When one gives undivided attention to the (vital) breath, and brings it to the utmost degree of pliancy, he can become as a (tender) babe. When he has cleansed away the most mysterious sights (of his imagination), he can become without a flaw.\n", "In loving the people and ruling the state, cannot he proceed without any (purpose of) action? In the opening and shutting of his gates of heaven, cannot he do so as a female bird? While his intelligence reaches in every direction, cannot he (appear to) be without knowledge?\n", "The Tao) produces (all things) and nourishes them; it produces them and does not claim them as its own; it does all, and yet does not boast of it; it presides over all, and yet does not control them. This is what is called 'The mysterious Quality' (of the Tao).\n", "The thirty spokes unite in the one nave; but it is on the empty space (for the axle), that the use of the wheel depends. Clay is fashioned into vessels; but it is on their empty hollowness, that their use depends. The door and windows are cut out (from the walls) to form an apartment; but it is on the empty space (within), that its use depends. Therefore, what has a (positive) existence serves for profitable adaptation, and what has not that for (actual) usefulness.\n", "Colour's five hues from th' eyes their sight will take; Music's five notes the ears as deaf can make; The flavours five deprive the mouth of taste; The chariot course, and the wild hunting waste Make mad the mind; and objects rare and strange, Sought for, men's conduct will to evil change.\n", "Therefore the sage seeks to satisfy (the craving of) the belly, and not the (insatiable longing of the) eyes. He puts from him the latter, and prefers to seek the former.\n", "Favour and disgrace would seem equally to be feared; honour and great calamity, to be regarded as personal conditions (of the same kind).\n", "What is meant by speaking thus of favour and disgrace? Disgrace is being in a low position (after the enjoyment of favour). The getting that (favour) leads to the apprehension (of losing it), and the losing it leads to the fear of (still greater calamity):--this is what is meant by saying that favour and disgrace would seem equally to be feared.\n", "And what is meant by saying that honour and great calamity are to be (similarly) regarded as personal conditions? What makes me liable to great calamity is my having the body (which I call myself); if I had not the body, what great calamity could come to me?\n", "Therefore he who would administer the kingdom, honouring it as he honours his own person, may be employed to govern it, and he who would administer it with the love which he bears to his own person may be entrusted with it.\n", "We look at it, and we do not see it, and we name it 'the Equable.' We listen to it, and we do not hear it, and we name it 'the Inaudible.' We try to grasp it, and do not get hold of it, and we name it 'the Subtle.' With these three qualities, it cannot be made the subject of description; and hence we blend them together and obtain The One.\n", "Its upper part is not bright, and its lower part is not obscure. Ceaseless in its action, it yet cannot be named, and then it again returns and becomes nothing. This is called the Form of the Formless, and the Semblance of the Invisible; this is called the Fleeting and Indeterminable.\n", "We meet it and do not see its Front; we follow it, and do not see its Back. When we can lay hold of the Tao of old to direct the things of the present day, and are able to know it as it was of old in the beginning, this is called (unwinding) the clue of Tao.\n", "The skilful masters (of the Tao) in old times, with a subtle and exquisite penetration, comprehended its mysteries, and were deep (also) so as to elude men's knowledge. As they were thus beyond men's knowledge, I will make an effort to describe of what sort they appeared to be.\n", "Shrinking looked they like those who wade through a stream in winter; irresolute like those who are afraid of all around them; grave like a guest (in awe of his host); evanescent like ice that is melting away; unpretentious like wood that has not been fashioned into anything; vacant like a valley, and dull like muddy water.\n", "Who can (make) the muddy water (clear)? Let it be still, and it will gradually become clear. Who can secure the condition of rest? Let movement go on, and the condition of rest will gradually arise.\n", "They who preserve this method of the Tao do not wish to be full (of themselves). It is through their not being full of themselves that they can afford to seem worn and not appear new and complete.\n", "The (state of) vacancy should be brought to the utmost degree, and that of stillness guarded with unwearying vigour. All things alike go through their processes of activity, and (then) we see them return (to their original state). When things (in the vegetable world) have displayed their luxuriant growth, we see each of them return to its root. This returning to their root is what we call the state of stillness; and that stillness may be called a reporting that they have fulfilled their appointed end.\n", "The report of that fulfilment is the regular, unchanging rule. To know that unchanging rule is to be intelligent; not to know it leads to wild movements and evil issues. The knowledge of that unchanging rule produces a (grand) capacity and forbearance, and that capacity and forbearance lead to a community (of feeling with all things). From this community of feeling comes a kingliness of character; and he who is king-like goes on to be heaven-like. In that likeness to heaven he possesses the Tao. Possessed of the Tao, he endures long; and to the end of his bodily life, is exempt from all danger of decay.\n", "In the highest antiquity, (the people) did not know that there were (their rulers). In the next age they loved them and praised them. In the next they feared them; in the next they despised them. Thus it was that when faith (in the Tao) was deficient (in the rulers) a want of faith in them ensued (in the people).\n", "How irresolute did those (earliest rulers) appear, showing (by their reticence) the importance which they set upon their words! Their work was done and their undertakings were successful, while the people all said, 'We are as we are, of ourselves!'\n", "When the Great Tao (Way or Method) ceased to be observed, benevolence and righteousness came into vogue. (Then) appeared wisdom and shrewdness, and there ensued great hypocrisy.\n", "When harmony no longer prevailed throughout the six kinships, filial sons found their manifestation; when the states and clans fell into disorder, loyal ministers appeared.\n", "If we could renounce our sageness and discard our wisdom, it would be better for the people a hundredfold. If we could renounce our benevolence and discard our righteousness, the people would again become filial and kindly. If we could renounce our artful contrivances and discard our (scheming for) gain, there would be no thieves nor robbers.\n", "Those three methods (of government) Thought olden ways in elegance did fail And made these names their want of worth to veil; But simple views, and courses plain and true Would selfish ends and many lusts eschew.\n", "When we renounce learning we have no troubles. The (ready) 'yes,' and (flattering) 'yea;'-- Small is the difference they display. But mark their issues, good and ill;-- What space the gulf between shall fill?\n", "What all men fear is indeed to be feared; but how wide and without end is the range of questions (asking to be discussed)!\n", "The multitude of men look satisfied and pleased; as if enjoying a full banquet, as if mounted on a tower in spring. I alone seem listless and still, my desires having as yet given no indication of their presence. I am like an infant which has not yet smiled. I look dejected and forlorn, as if I had no home to go to. The multitude of men all have enough and to spare. I alone seem to have lost everything. My mind is that of a stupid man; I am in a state of chaos.\n", "Ordinary men look bright and intelligent, while I alone seem to be benighted. They look full of discrimination, while I alone am dull and confused. I seem to be carried about as on the sea, drifting as if I had nowhere to rest. All men have their spheres of action, while I alone seem dull and incapable, like a rude borderer. (Thus) I alone am different from other men, but I value the nursing-mother (the Tao).\n", "The grandest forms of active force From Tao come, their only source. Who can of Tao the nature tell? Our sight it flies, our touch as well. Eluding sight, eluding touch, The forms of things all in it crouch; Eluding touch, eluding sight, There are their semblances, all right. Profound it is, dark and obscure; Things' essences all there endure. Those essences the truth enfold Of what, when seen, shall then be told. Now it is so; 'twas so of old. Its name--what passes not away; So, in their beautiful array, Things form and never know decay.\n", "How know I that it is so with all the beauties of existing things? By this (nature of the Tao).\n", "The partial becomes complete; the crooked, straight; the empty, full; the worn out, new. He whose (desires) are few gets them; he whose (desires) are many goes astray.\n", "Therefore the sage holds in his embrace the one thing (of humility), and manifests it to all the world. He is free from self-display, and therefore he shines; from self-assertion, and therefore he is distinguished; from self-boasting, and therefore his merit is acknowledged; from self-complacency, and therefore he acquires superiority. It is because he is thus free from striving that therefore no one in the world is able to strive with him.\n", "That saying of the ancients that 'the partial becomes complete' was not vainly spoken:--all real completion is comprehended under it.\n", "Abstaining from speech marks him who is obeying the spontaneity of his nature. A violent wind does not last for a whole morning; a sudden rain does not last for the whole day. To whom is it that these (two) things are owing? To Heaven and Earth. If Heaven and Earth cannot make such (spasmodic) actings last long, how much less can man!\n", "Therefore when one is making the Tao his business, those who are also pursuing it, agree with him in it, and those who are making the manifestation of its course their object agree with him in that; while even those who are failing in both these things agree with him where they fail.\n", "Hence, those with whom he agrees as to the Tao have the happiness of attaining to it; those with whom he agrees as to its manifestation have the happiness of attaining to it; and those with whom he agrees in their failure have also the happiness of attaining (to the Tao). (But) when there is not faith sufficient (on his part), a want of faith (in him) ensues (on the part of the others).\n", "He who stands on his tiptoes does not stand firm; he who stretches his legs does not walk (easily). (So), he who displays himself does not shine; he who asserts his own views is not distinguished; he who vaunts himself does not find his merit acknowledged; he who is self-conceited has no superiority allowed to him. Such conditions, viewed from the standpoint of the Tao, are like remnants of food, or a tumour on the body, which all dislike. Hence those who pursue (the course) of the Tao do not adopt and allow them.\n", "There was something undefined and complete, coming into existence before Heaven and Earth. How still it was and formless, standing alone, and undergoing no change, reaching everywhere and in no danger (of being exhausted)! It may be regarded as the Mother of all things.\n", "I do not know its name, and I give it the designation of the Tao (the Way or Course). Making an effort (further) to give it a name I call it The Great.\n", "Great, it passes on (in constant flow). Passing on, it becomes remote. Having become remote, it returns. Therefore the Tao is great; Heaven is great; Earth is great; and the (sage) king is also great. In the universe there are four that are great, and the (sage) king is one of them.\n", "Man takes his law from the Earth; the Earth takes its law from Heaven; Heaven takes its law from the Tao. The law of the Tao is its being what it is.\n", "Gravity is the root of lightness; stillness, the ruler of movement.\n", "Therefore a wise prince, marching the whole day, does not go far from his baggage waggons. Although he may have brilliant prospects to look at, he quietly remains (in his proper place), indifferent to them. How should the lord of a myriad chariots carry himself lightly before the kingdom? If he do act lightly, he has lost his root (of gravity); if he proceed to active movement, he will lose his throne.\n", "The skilful traveller leaves no traces of his wheels or footsteps; the skilful speaker says nothing that can be found fault with or blamed; the skilful reckoner uses no tallies; the skilful closer needs no bolts or bars, while to open what he has shut will be impossible; the skilful binder uses no strings or knots, while to unloose what he has bound will be impossible. In the same way the sage is always skilful at saving men, and so he does not cast away any man; he is always skilful at saving things, and so he does not cast away anything. This is called 'Hiding the light of his procedure.'\n", "Therefore the man of skill is a master (to be looked up to) by him who has not the skill; and he who has not the skill is the helper of (the reputation of) him who has the skill. If the one did not honour his master, and the other did not rejoice in his helper, an (observer), though intelligent, might greatly err about them. This is called 'The utmost degree of mystery.'\n", "Who knows his manhood's strength, Yet still his female feebleness maintains; As to one channel flow the many drains, All come to him, yea, all beneath the sky. Thus he the constant excellence retains; The simple child again, free from all stains.\n", "Who knows how white attracts, Yet always keeps himself within black's shade, The pattern of humility displayed, Displayed in view of all beneath the sky; He in the unchanging excellence arrayed, Endless return to man's first state has made.\n", "Who knows how glory shines, Yet loves disgrace, nor e'er for it is pale; Behold his presence in a spacious vale, To which men come from all beneath the sky. The unchanging excellence completes its tale; The simple infant man in him we hail.\n", "The unwrought material, when divided and distributed, forms vessels. The sage, when employed, becomes the Head of all the Officers (of government); and in his greatest regulations he employs no violent measures.\n", "If any one should wish to get the kingdom for himself, and to effect this by what he does, I see that he will not succeed. The kingdom is a spirit-like thing, and cannot be got by active doing. He who would so win it destroys it; he who would hold it in his grasp loses it.\n", "The course and nature of things is such that What was in front is now behind; What warmed anon we freezing find. Strength is of weakness oft the spoil; The store in ruins mocks our toil.\n", "Hence the sage puts away excessive effort, extravagance, and easy indulgence.\n", "He who would assist a lord of men in harmony with the Tao will not assert his mastery in the kingdom by force of arms. Such a course is sure to meet with its proper return.\n", "Wherever a host is stationed, briars and thorns spring up. In the sequence of great armies there are sure to be bad years.\n", "A skilful (commander) strikes a decisive blow, and stops. He does not dare (by continuing his operations) to assert and complete his mastery. He will strike the blow, but will be on his guard against being vain or boastful or arrogant in consequence of it. He strikes it as a matter of necessity; he strikes it, but not from a wish for mastery.\n", "When things have attained their strong maturity they become old. This may be said to be not in accordance with the Tao: and what is not in accordance with it soon comes to an end.\n", "Now arms, however beautiful, are instruments of evil omen, hateful, it may be said, to all creatures. Therefore they who have the Tao do not like to employ them.\n", "The superior man ordinarily considers the left hand the most honourable place, but in time of war the right hand. Those sharp weapons are instruments of evil omen, and not the instruments of the superior man;--he uses them only on the compulsion of necessity. Calm and repose are what he prizes; victory (by force of arms) is to him undesirable. To consider this desirable would be to delight in the slaughter of men; and he who delights in the slaughter of men cannot get his will in the kingdom.\n", "On occasions of festivity to be on the left hand is the prized position; on occasions of mourning, the right hand. The second in command of the army has his place on the left; the general commanding in chief has his on the right;--his place, that is, is assigned to him as in the rites of mourning. He who has killed multitudes of men should weep for them with the bitterest grief; and the victor in battle has his place (rightly) according to those rites.\n", "The Tao, considered as unchanging, has no name.\n", "Though in its primordial simplicity it may be small, the whole world dares not deal with (one embodying) it as a minister. If a feudal prince or the king could guard and hold it, all would spontaneously submit themselves to him.\n", "Heaven and Earth (under its guidance) unite together and send down the sweet dew, which, without the directions of men, reaches equally everywhere as of its own accord.\n", "As soon as it proceeds to action, it has a name. When it once has that name, (men) can know to rest in it. When they know to rest in it, they can be free from all risk of failure and error.\n", "The relation of the Tao to all the world is like that of the great rivers and seas to the streams from the valleys.\n", "He who knows other men is discerning; he who knows himself is intelligent. He who overcomes others is strong; he who overcomes himself is mighty. He who is satisfied with his lot is rich; he who goes on acting with energy has a (firm) will.\n", "He who does not fail in the requirements of his position, continues long; he who dies and yet does not perish, has longevity.\n", "All-pervading is the Great Tao! It may be found on the left hand and on the right.\n", "All things depend on it for their production, which it gives to them, not one refusing obedience to it. When its work is accomplished, it does not claim the name of having done it. It clothes all things as with a garment, and makes no assumption of being their lord;--it may be named in the smallest things. All things return (to their root and disappear), and do not know that it is it which presides over their doing so;--it may be named in the greatest things.\n", "Hence the sage is able (in the same way) to accomplish his great achievements. It is through his not making himself great that he can accomplish them.\n", "To him who holds in his hands the Great Image (of the invisible Tao), the whole world repairs. Men resort to him, and receive no hurt, but (find) rest, peace, and the feeling of ease.\n", "Music and dainties will make the passing guest stop (for a time). But though the Tao as it comes from the mouth, seems insipid and has no flavour, though it seems not worth being looked at or listened to, the use of it is inexhaustible.\n", "When one is about to take an inspiration, he is sure to make a (previous) expiration; when he is going to weaken another, he will first strengthen him; when he is going to overthrow another, he will first have raised him up; when he is going to despoil another, he will first have made gifts to him:--this is called 'Hiding the light (of his procedure).'\n", "The soft overcomes the hard; and the weak the strong.\n", "Fishes should not be taken from the deep; instruments for the profit of a state should not be shown to the people.\n", "The Tao in its regular course does nothing (for the sake of doing it), and so there is nothing which it does not do.\n", "If princes and kings were able to maintain it, all things would of themselves be transformed by them.\n", "If this transformation became to me an object of desire, I would express the desire by the nameless simplicity.\n", "Simplicity without a name Is free from all external aim. With no desire, at rest and still, All things go right as of their will.\n", "PART II.\n", "Those who) possessed in highest degree the attributes (of the Tao) did not (seek) to show them, and therefore they possessed them (in fullest measure). (Those who) possessed in a lower degree those attributes (sought how) not to lose them, and therefore they did not possess them (in fullest measure).\n", "Those who) possessed in the highest degree those attributes did nothing (with a purpose), and had no need to do anything. (Those who) possessed them in a lower degree were (always) doing, and had need to be so doing.\n", "Those who) possessed the highest benevolence were (always seeking) to carry it out, and had no need to be doing so. (Those who) possessed the highest righteousness were (always seeking) to carry it out, and had need to be so doing.\n", "Those who) possessed the highest (sense of) propriety were (always seeking) to show it, and when men did not respond to it, they bared the arm and marched up to them.\n", "Thus it was that when the Tao was lost, its attributes appeared; when its attributes were lost, benevolence appeared; when benevolence was lost, righteousness appeared; and when righteousness was lost, the proprieties appeared.\n", "Now propriety is the attenuated form of leal-heartedness and good faith, and is also the commencement of disorder; swift apprehension is (only) a flower of the Tao, and is the beginning of stupidity.\n", "Thus it is that the Great man abides by what is solid, and eschews what is flimsy; dwells with the fruit and not with the flower. It is thus that he puts away the one and makes choice of the other.\n", "The things which from of old have got the One (the Tao) are--\n", "Heaven which by it is bright and pure; Earth rendered thereby firm and sure; Spirits with powers by it supplied; Valleys kept full throughout their void All creatures which through it do live Princes and kings who from it get The model which to all they give.\n", "All these are the results of the One (Tao).\n", "If heaven were not thus pure, it soon would rend; If earth were not thus sure, 'twould break and bend; Without these powers, the spirits soon would fail; If not so filled, the drought would parch each vale; Without that life, creatures would pass away; Princes and kings, without that moral sway, However grand and high, would all decay.\n", "Thus it is that dignity finds its (firm) root in its (previous) meanness, and what is lofty finds its stability in the lowness (from which it rises). Hence princes and kings call themselves 'Orphans,' 'Men of small virtue,' and as 'Carriages without a nave.' Is not this an acknowledgment that in their considering themselves mean they see the foundation of their dignity? So it is that in the enumeration of the different parts of a carriage we do not come on what makes it answer the ends of a carriage. They do not wish to show themselves elegant-looking as jade, but (prefer) to be coarse-looking as an (ordinary) stone.\n", "The movement of the Tao By contraries proceeds; And weakness marks the course Of Tao's mighty deeds.\n", "All things under heaven sprang from It as existing (and named); that existence sprang from It as non-existent (and not named).\n", "Scholars of the highest class, when they hear about the Tao, earnestly carry it into practice. Scholars of the middle class, when they have heard about it, seem now to keep it and now to lose it. Scholars of the lowest class, when they have heard about it, laugh greatly at it. If it were not (thus) laughed at, it would not be fit to be the Tao.\n", "Therefore the sentence-makers have thus expressed themselves:--\n", "The Tao, when brightest seen, seems light to lack; Who progress in it makes, seems drawing back; Its even way is like a rugged track. Its highest virtue from the vale doth rise; Its greatest beauty seems to offend the eyes; And he has most whose lot the least supplies. Its firmest virtue seems but poor and low; Its solid truth seems change to undergo; Its largest square doth yet no corner show A vessel great, it is the slowest made; Loud is its sound, but never word it said; A semblance great, the shadow of a shade.'\n", "The Tao is hidden, and has no name; but it is the Tao which is skilful at imparting (to all things what they need) and making them complete.\n", "The Tao produced One; One produced Two; Two produced Three; Three produced All things. All things leave behind them the Obscurity (out of which they have come), and go forward to embrace the Brightness (into which they have emerged), while they are harmonised by the Breath of Vacancy.\n", "What men dislike is to be orphans, to have little virtue, to be as carriages without naves; and yet these are the designations which kings and princes use for themselves. So it is that some things are increased by being diminished, and others are diminished by being increased.\n", "What other men (thus) teach, I also teach. The violent and strong do not die their natural death. I will make this the basis of my teaching.\n", "The softest thing in the world dashes against and overcomes the hardest; that which has no (substantial) existence enters where there is no crevice. I know hereby what advantage belongs to doing nothing (with a purpose).\n", "There are few in the world who attain to the teaching without words, and the advantage arising from non-action.\n", "Or fame or life, Which do you hold more dear? Or life or wealth, To which would you adhere? Keep life and lose those other things; Keep them and lose your life:--which brings Sorrow and pain more near?\n", "Thus we may see, Who cleaves to fame Rejects what is more great; Who loves large stores Gives up the richer state.\n", "Who is content Needs fear no shame. Who knows to stop Incurs no blame. From danger free Long live shall he.\n", "Who thinks his great achievements poor Shall find his vigour long endure. Of greatest fulness, deemed a void, Exhaustion ne'er shall stem the tide. Do thou what's straight still crooked deem; Thy greatest art still stupid seem, And eloquence a stammering scream.\n", "Constant action overcomes cold; being still overcomes heat. Purity and stillness give the correct law to all under heaven.\n", "When the Tao prevails in the world, they send back their swift horses to (draw) the dung-carts. When the Tao is disregarded in the world, the war-horses breed in the border lands.\n", "There is no guilt greater than to sanction ambition; no calamity greater than to be discontented with one's lot; no fault greater than the wish to be getting. Therefore the sufficiency of contentment is an enduring and unchanging sufficiency.\n", "Without going outside his door, one understands (all that takes place) under the sky; without looking out from his window, one sees the Tao of Heaven. The farther that one goes out (from himself), the less he knows.\n", "Therefore the sages got their knowledge without travelling; gave their (right) names to things without seeing them; and accomplished their ends without any purpose of doing so.\n", "He who devotes himself to learning (seeks) from day to day to increase (his knowledge); he who devotes himself to the Tao (seeks) from day to day to diminish (his doing).\n", "He diminishes it and again diminishes it, till he arrives at doing nothing (on purpose). Having arrived at this point of non-action, there is nothing which he does not do.\n", "He who gets as his own all under heaven does so by giving himself no trouble (with that end). If one take trouble (with that end), he is not equal to getting as his own all under heaven.\n", "The sage has no invariable mind of his own; he makes the mind of the people his mind.\n", "To those who are good (to me), I am good; and to those who are not good (to me), I am also good;--and thus (all) get to be good. To those who are sincere (with me), I am sincere; and to those who are not sincere (with me), I am also sincere;--and thus (all) get to be sincere.\n", "The sage has in the world an appearance of indecision, and keeps his mind in a state of indifference to all. The people all keep their eyes and ears directed to him, and he deals with them all as his children.\n", "Men come forth and live; they enter (again) and die.\n", "Of every ten three are ministers of life (to themselves); and three are ministers of death.\n", "There are also three in every ten whose aim is to live, but whose movements tend to the land (or place) of death. And for what reason? Because of their excessive endeavours to perpetuate life.\n", "But I have heard that he who is skilful in managing the life entrusted to him for a time travels on the land without having to shun rhinoceros or tiger, and enters a host without having to avoid buff coat or sharp weapon. The rhinoceros finds no place in him into which to thrust its horn, nor the tiger a place in which to fix its claws, nor the weapon a place to admit its point. And for what reason? Because there is in him no place of death.\n", "All things are produced by the Tao, and nourished by its outflowing operation. They receive their forms according to the nature of each, and are completed according to the circumstances of their condition. Therefore all things without exception honour the Tao, and exalt its outflowing operation.\n", "This honouring of the Tao and exalting of its operation is not the result of any ordination, but always a spontaneous tribute.\n", "Thus it is that the Tao produces (all things), nourishes them, brings them to their full growth, nurses them, completes them, matures them, maintains them, and overspreads them.\n", "It produces them and makes no claim to the possession of them; it carries them through their processes and does not vaunt its ability in doing so; it brings them to maturity and exercises no control over them;--this is called its mysterious operation.\n", "The Tao) which originated all under the sky is to be considered as the mother of them all.\n", "When the mother is found, we know what her children should be. When one knows that he is his mother's child, and proceeds to guard (the qualities of) the mother that belong to him, to the end of his life he will be free from all peril.\n", "Let him keep his mouth closed, and shut up the portals (of his nostrils), and all his life he will be exempt from laborious exertion. Let him keep his mouth open, and (spend his breath) in the promotion of his affairs, and all his life there will be no safety for him.\n", "The perception of what is small is (the secret of) clear-sightedness; the guarding of what is soft and tender is (the secret of) strength.\n", "Who uses well his light, Reverting to its (source so) bright, Will from his body ward all blight, And hides the unchanging from men's sight.\n", "If I were suddenly to become known, and (put into a position to) conduct (a government) according to the Great Tao, what I should be most afraid of would be a boastful display.\n", "The great Tao (or way) is very level and easy; but people love the by-ways.\n", "Their court(-yards and buildings) shall be well kept, but their fields shall be ill-cultivated, and their granaries very empty. They shall wear elegant and ornamented robes, carry a sharp sword at their girdle, pamper themselves in eating and drinking, and have a superabundance of property and wealth;--such (princes) may be called robbers and boasters. This is contrary to the Tao surely!\n", "What (Tao's) skilful planter plants Can never be uptorn; What his skilful arms enfold, From him can ne'er be borne. Sons shall bring in lengthening line, Sacrifices to his shrine.\n", "Tao when nursed within one's self, His vigour will make true; And where the family it rules What riches will accrue! The neighbourhood where it prevails In thriving will abound; And when 'tis seen throughout the state, Good fortune will be found. Employ it the kingdom o'er, And men thrive all around.\n", "In this way the effect will be seen in the person, by the observation of different cases; in the family; in the neighbourhood; in the state; and in the kingdom.\n", "How do I know that this effect is sure to hold thus all under the sky? By this (method of observation).\n", "He who has in himself abundantly the attributes (of the Tao) is like an infant. Poisonous insects will not sting him; fierce beasts will not seize him; birds of prey will not strike him.\n", "The infant's) bones are weak and its sinews soft, but yet its grasp is firm. It knows not yet the union of male and female, and yet its virile member may be excited;--showing the perfection of its physical essence. All day long it will cry without its throat becoming hoarse;--showing the harmony (in its constitution).\n", "To him by whom this harmony is known, (The secret of) the unchanging (Tao) is shown, And in the knowledge wisdom finds its throne. All life-increasing arts to evil turn; Where the mind makes the vital breath to burn, (False) is the strength, (and o'er it we should mourn.)\n", "When things have become strong, they (then) become old, which may be said to be contrary to the Tao. Whatever is contrary to the Tao soon ends.\n", "He who knows (the Tao) does not (care to) speak (about it); he who is (ever ready to) speak about it does not know it.\n", "He (who knows it) will keep his mouth shut and close the portals (of his nostrils). He will blunt his sharp points and unravel the complications of things; he will attemper his brightness, and bring himself into agreement with the obscurity (of others). This is called 'the Mysterious Agreement.'\n", "Such an one) cannot be treated familiarly or distantly; he is beyond all consideration of profit or injury; of nobility or meanness:--he is the noblest man under heaven.\n", "A state may be ruled by (measures of) correction; weapons of war may be used with crafty dexterity; (but) the kingdom is made one's own (only) by freedom from action and purpose.\n", "How do I know that it is so? By these facts:--In the kingdom the multiplication of prohibitive enactments increases the poverty of the people; the more implements to add to their profit that the people have, the greater disorder is there in the state and clan; the more acts of crafty dexterity that men possess, the more do strange contrivances appear; the more display there is of legislation, the more thieves and robbers there are.\n", "Therefore a sage has said, 'I will do nothing (of purpose), and the people will be transformed of themselves; I will be fond of keeping still, and the people will of themselves become correct. I will take no trouble about it, and the people will of themselves become rich; I will manifest no ambition, and the people will of themselves attain to the primitive simplicity.'\n", "The government that seems the most unwise, Oft goodness to the people best supplies; That which is meddling, touching everything, Will work but ill, and disappointment bring.\n", "Misery!--happiness is to be found by its side! Happiness!--misery lurks beneath it! Who knows what either will come to in the end?\n", "Shall we then dispense with correction? The (method of) correction shall by a turn become distortion, and the good in it shall by a turn become evil. The delusion of the people (on this point) has indeed subsisted for a long time.\n", "Therefore the sage is (like) a square which cuts no one (with its angles); (like) a corner which injures no one (with its sharpness). He is straightforward, but allows himself no license; he is bright, but does not dazzle.\n", "For regulating the human (in our constitution) and rendering the (proper) service to the heavenly, there is nothing like moderation.\n", "It is only by this moderation that there is effected an early return (to man's normal state). That early return is what I call the repeated accumulation of the attributes (of the Tao). With that repeated accumulation of those attributes, there comes the subjugation (of every obstacle to such return). Of this subjugation we know not what shall be the limit; and when one knows not what the limit shall be, he may be the ruler of a state.\n", "He who possesses the mother of the state may continue long. His case is like that (of the plant) of which we say that its roots are deep and its flower stalks firm:--this is the way to secure that its enduring life shall long be seen.\n", "Governing a great state is like cooking small fish.\n", "Let the kingdom be governed according to the Tao, and the manes of the departed will not manifest their spiritual energy. It is not that those manes have not that spiritual energy, but it will not be employed to hurt men. It is not that it could not hurt men, but neither does the ruling sage hurt them.\n", "When these two do not injuriously affect each other, their good influences converge in the virtue (of the Tao).\n", "What makes a great state is its being (like) a low-lying, down-flowing (stream);--it becomes the centre to which tend (all the small states) under heaven.\n", "To illustrate from) the case of all females:--the female always overcomes the male by her stillness. Stillness may be considered (a sort of) abasement.\n", "Thus it is that a great state, by condescending to small states, gains them for itself; and that small states, by abasing themselves to a great state, win it over to them. In the one case the abasement leads to gaining adherents, in the other case to procuring favour.\n", "The great state only wishes to unite men together and nourish them; a small state only wishes to be received by, and to serve, the other. Each gets what it desires, but the great state must learn to abase itself.\n", "Tao has of all things the most honoured place. No treasures give good men so rich a grace; Bad men it guards, and doth their ill efface.\n", "Its) admirable words can purchase honour; (its) admirable deeds can raise their performer above others. Even men who are not good are not abandoned by it.\n", "Therefore when the sovereign occupies his place as the Son of Heaven, and he has appointed his three ducal ministers, though (a prince) were to send in a round symbol-of-rank large enough to fill both the hands, and that as the precursor of the team of horses (in the court-yard), such an offering would not be equal to (a lesson of) this Tao, which one might present on his knees.\n", "Why was it that the ancients prized this Tao so much? Was it not because it could be got by seeking for it, and the guilty could escape (from the stain of their guilt) by it? This is the reason why all under heaven consider it the most valuable thing.\n", "It is the way of the Tao) to act without (thinking of) acting; to conduct affairs without (feeling the) trouble of them; to taste without discerning any flavour; to consider what is small as great, and a few as many; and to recompense injury with kindness.\n", "The master of it) anticipates things that are difficult while they are easy, and does things that would become great while they are small. All difficult things in the world are sure to arise from a previous state in which they were easy, and all great things from one in which they were small. Therefore the sage, while he never does what is great, is able on that account to accomplish the greatest things.\n", "He who lightly promises is sure to keep but little faith; he who is continually thinking things easy is sure to find them difficult. Therefore the sage sees difficulty even in what seems easy, and so never has any difficulties.\n", "That which is at rest is easily kept hold of; before a thing has given indications of its presence, it is easy to take measures against it; that which is brittle is easily broken; that which is very small is easily dispersed. Action should be taken before a thing has made its appearance; order should be secured before disorder has begun.\n", "The tree which fills the arms grew from the tiniest sprout; the tower of nine storeys rose from a (small) heap of earth; the journey of a thousand li commenced with a single step.\n", "He who acts (with an ulterior purpose) does harm; he who takes hold of a thing (in the same way) loses his hold. The sage does not act (so), and therefore does no harm; he does not lay hold (so), and therefore does not lose his hold. (But) people in their conduct of affairs are constantly ruining them when they are on the eve of success. If they were careful at the end, as (they should be) at the beginning, they would not so ruin them.\n", "Therefore the sage desires what (other men) do not desire, and does not prize things difficult to get; he learns what (other men) do not learn, and turns back to what the multitude of men have passed by. Thus he helps the natural development of all things, and does not dare to act (with an ulterior purpose of his own).\n", "The ancients who showed their skill in practising the Tao did so, not to enlighten the people, but rather to make them simple and ignorant.\n", "The difficulty in governing the people arises from their having much knowledge. He who (tries to) govern a state by his wisdom is a scourge to it; while he who does not (try to) do so is a blessing.\n", "He who knows these two things finds in them also his model and rule. Ability to know this model and rule constitutes what we call the mysterious excellence (of a governor). Deep and far-reaching is such mysterious excellence, showing indeed its possessor as opposite to others, but leading them to a great conformity to him.\n", "That whereby the rivers and seas are able to receive the homage and tribute of all the valley streams, is their skill in being lower than they;--it is thus that they are the kings of them all. So it is that the sage (ruler), wishing to be above men, puts himself by his words below them, and, wishing to be before them, places his person behind them.\n", "In this way though he has his place above them, men do not feel his weight, nor though he has his place before them, do they feel it an injury to them.\n", "Therefore all in the world delight to exalt him and do not weary of him. Because he does not strive, no one finds it possible to strive with him.\n", "All the world says that, while my Tao is great, it yet appears to be inferior (to other systems of teaching). Now it is just its greatness that makes it seem to be inferior. If it were like any other (system), for long would its smallness have been known!\n", "But I have three precious things which I prize and hold fast. The first is gentleness; the second is economy; and the third is shrinking from taking precedence of others.\n", "With that gentleness I can be bold; with that economy I can be liberal; shrinking from taking precedence of others, I can become a vessel of the highest honour. Now-a-days they give up gentleness and are all for being bold; economy, and are all for being liberal; the hindmost place, and seek only to be foremost;--(of all which the end is) death.\n", "Gentleness is sure to be victorious even in battle, and firmly to maintain its ground. Heaven will save its possessor, by his (very) gentleness protecting him.\n", "He who in (Tao's) wars has skill Assumes no martial port; He who fights with most good will To rage makes no resort. He who vanquishes yet still Keeps from his foes apart; He whose hests men most fulfil Yet humbly plies his art.\n", "Thus we say, 'He ne'er contends, And therein is his might.' Thus we say, 'Men's wills he bends, That they with him unite.' Thus we say, 'Like Heaven's his ends, No sage of old more bright.'\n", "A master of the art of war has said, 'I do not dare to be the host (to commence the war); I prefer to be the guest (to act on the defensive). I do not dare to advance an inch; I prefer to retire a foot.' This is called marshalling the ranks where there are no ranks; baring the arms (to fight) where there are no arms to bare; grasping the weapon where there is no weapon to grasp; advancing against the enemy where there is no enemy.\n", "There is no calamity greater than lightly engaging in war. To do that is near losing (the gentleness) which is so precious. Thus it is that when opposing weapons are (actually) crossed, he who deplores (the situation) conquers.\n", "My words are very easy to know, and very easy to practise; but there is no one in the world who is able to know and able to practise them.\n", "There is an originating and all-comprehending (principle) in my words, and an authoritative law for the things (which I enforce). It is because they do not know these, that men do not know me.\n", "They who know me are few, and I am on that account (the more) to be prized. It is thus that the sage wears (a poor garb of) hair cloth, while he carries his (signet of) jade in his bosom.\n", "To know and yet (think) we do not know is the highest (attainment); not to know (and yet think) we do know is a disease.\n", "It is simply by being pained at (the thought of) having this disease that we are preserved from it. The sage has not the disease. He knows the pain that would be inseparable from it, and therefore he does not have it.\n", "When the people do not fear what they ought to fear, that which is their great dread will come on them.\n", "Let them not thoughtlessly indulge themselves in their ordinary life; let them not act as if weary of what that life depends on.\n", "It is by avoiding such indulgence that such weariness does not arise.\n", "Therefore the sage knows (these things) of himself, but does not parade (his knowledge); loves, but does not (appear to set a) value on, himself. And thus he puts the latter alternative away and makes choice of the former.\n", "He whose boldness appears in his daring (to do wrong, in defiance of the laws) is put to death; he whose boldness appears in his not daring (to do so) lives on. Of these two cases the one appears to be advantageous, and the other to be injurious. But\n", "When Heaven's anger smites a man, Who the cause shall truly scan?\n", "On this account the sage feels a difficulty (as to what to do in the former case).\n", "It is the way of Heaven not to strive, and yet it skilfully overcomes; not to speak, and yet it is skilful in obtaining a reply; does not call, and yet men come to it of themselves. Its demonstrations are quiet, and yet its plans are skilful and effective. The meshes of the net of Heaven are large; far apart, but letting nothing escape.\n", "The people do not fear death; to what purpose is it to (try to) frighten them with death? If the people were always in awe of death, and I could always seize those who do wrong, and put them to death, who would dare to do wrong?\n", "There is always One who presides over the infliction of death. He who would inflict death in the room of him who so presides over it may be described as hewing wood instead of a great carpenter. Seldom is it that he who undertakes the hewing, instead of the great carpenter, does not cut his own hands!\n", "The people suffer from famine because of the multitude of taxes consumed by their superiors. It is through this that they suffer famine.\n", "The people are difficult to govern because of the (excessive) agency of their superiors (in governing them). It is through this that they are difficult to govern.\n", "The people make light of dying because of the greatness of their labours in seeking for the means of living. It is this which makes them think light of dying. Thus it is that to leave the subject of living altogether out of view is better than to set a high value on it.\n", "Man at his birth is supple and weak; at his death, firm and strong. (So it is with) all things. Trees and plants, in their early growth, are soft and brittle; at their death, dry and withered.\n", "Thus it is that firmness and strength are the concomitants of death; softness and weakness, the concomitants of life.\n", "Hence he who (relies on) the strength of his forces does not conquer; and a tree which is strong will fill the out-stretched arms, (and thereby invites the feller.)\n", "Therefore the place of what is firm and strong is below, and that of what is soft and weak is above.\n", "May not the Way (or Tao) of Heaven be compared to the (method of) bending a bow? The (part of the bow) which was high is brought low, and what was low is raised up. (So Heaven) diminishes where there is superabundance, and supplements where there is deficiency.\n", "It is the Way of Heaven to diminish superabundance, and to supplement deficiency. It is not so with the way of man. He takes away from those who have not enough to add to his own superabundance.\n", "Who can take his own superabundance and therewith serve all under heaven? Only he who is in possession of the Tao!\n", "Therefore the (ruling) sage acts without claiming the results as his; he achieves his merit and does not rest (arrogantly) in it:--he does not wish to display his superiority.\n", "There is nothing in the world more soft and weak than water, and yet for attacking things that are firm and strong there is nothing that can take precedence of it;--for there is nothing (so effectual) for which it can be changed.\n", "Every one in the world knows that the soft overcomes the hard, and the weak the strong, but no one is able to carry it out in practice.\n", "Therefore a sage has said, 'He who accepts his state's reproach, Is hailed therefore its altars' lord; To him who bears men's direful woes They all the name of King accord.'\n", "Words that are strictly true seem to be paradoxical.\n", "When a reconciliation is effected (between two parties) after a great animosity, there is sure to be a grudge remaining (in the mind of the one who was wrong). And how can this be beneficial (to the other)?\n", "Therefore (to guard against this), the sage keeps the left-hand portion of the record of the engagement, and does not insist on the (speedy) fulfilment of it by the other party. (So), he who has the attributes (of the Tao) regards (only) the conditions of the engagement, while he who has not those attributes regards only the conditions favourable to himself.\n", "In the Way of Heaven, there is no partiality of love; it is always on the side of the good man.\n", "In a little state with a small population, I would so order it, that, though there were individuals with the abilities of ten or a hundred men, there should be no employment of them; I would make the people, while looking on death as a grievous thing, yet not remove elsewhere (to avoid it).\n", "Though they had boats and carriages, they should have no occasion to ride in them; though they had buff coats and sharp weapons, they should have no occasion to don or use them.\n", "I would make the people return to the use of knotted cords (instead of the written characters).\n", "They should think their (coarse) food sweet; their (plain) clothes beautiful; their (poor) dwellings places of rest; and their common (simple) ways sources of enjoyment.\n", "There should be a neighbouring state within sight, and the voices of the fowls and dogs should be heard all the way from it to us, but I would make the people to old age, even to death, not have any intercourse with it.\n", "Sincere words are not fine; fine words are not sincere. Those who are skilled (in the Tao) do not dispute (about it); the disputatious are not skilled in it. Those who know (the Tao) are not extensively learned; the extensively learned do not know it.\n", "The sage does not accumulate (for himself). The more that he expends for others, the more does he possess of his own; the more that he gives to others, the more does he have himself.\n", "With all the sharpness of the Way of Heaven, it injures not; with all the doing in the way of the sage he does not strive.\n", "End of the Project Gutenberg EBook of Tao Teh King, by Lao-Tze\n", "END OF THIS PROJECT GUTENBERG EBOOK TAO TEH KING ***\n", "This file should be named 216.txt or 216.zip ***** This and all associated files of various formats will be found in: http://www.gutenberg.org/2/1/216/\n", "Produced by Gregory Walker\n", "Updated editions will replace the previous one--the old editions will be renamed.\n", "Creating the works from public domain print editions means that no one owns a United States copyright in these works, so the Foundation (and you!) can copy and distribute it in the United States without permission and without paying copyright royalties. Special rules, set forth in the General Terms of Use part of this license, apply to copying and distributing Project Gutenberg-tm electronic works to protect the PROJECT GUTENBERG-tm concept and trademark. Project Gutenberg is a registered trademark, and may not be used if you charge for the eBooks, unless you receive specific permission. If you do not charge anything for copies of this eBook, complying with the rules is very easy. You may use this eBook for nearly any purpose such as creation of derivative works, reports, performances and research. They may be modified and printed and given away--you may do practically ANYTHING with public domain eBooks. Redistribution is subject to the trademark license, especially commercial redistribution.\n", "START: FULL LICENSE ***\n", "THE FULL PROJECT GUTENBERG LICENSE PLEASE READ THIS BEFORE YOU DISTRIBUTE OR USE THIS WORK\n", "To protect the Project Gutenberg-tm mission of promoting the free distribution of electronic works, by using or distributing this work (or any other work associated in any way with the phrase \"Project Gutenberg\"), you agree to comply with all the terms of the Full Project Gutenberg-tm License (available with this file or online at http://gutenberg.org/license).\n", "Section 1. General Terms of Use and Redistributing Project Gutenberg-tm electronic works\n", "A. By reading or using any part of this Project Gutenberg-tm electronic work, you indicate that you have read, understand, agree to and accept all the terms of this license and intellectual property (trademark/copyright) agreement. If you do not agree to abide by all the terms of this agreement, you must cease using and return or destroy all copies of Project Gutenberg-tm electronic works in your possession. If you paid a fee for obtaining a copy of or access to a Project Gutenberg-tm electronic work and you do not agree to be bound by the terms of this agreement, you may obtain a refund from the person or entity to whom you paid the fee as set forth in paragraph 1.E.8.\n", "B. \"Project Gutenberg\" is a registered trademark. It may only be used on or associated in any way with an electronic work by people who agree to be bound by the terms of this agreement. There are a few things that you can do with most Project Gutenberg-tm electronic works even without complying with the full terms of this agreement. See paragraph 1.C below. There are a lot of things you can do with Project Gutenberg-tm electronic works if you follow the terms of this agreement and help preserve free future access to Project Gutenberg-tm electronic works. See paragraph 1.E below.\n", "C. The Project Gutenberg Literary Archive Foundation (\"the Foundation\" or PGLAF), owns a compilation copyright in the collection of Project Gutenberg-tm electronic works. Nearly all the individual works in the collection are in the public domain in the United States. If an individual work is in the public domain in the United States and you are located in the United States, we do not claim a right to prevent you from copying, distributing, performing, displaying or creating derivative works based on the work as long as all references to Project Gutenberg are removed. Of course, we hope that you will support the Project Gutenberg-tm mission of promoting free access to electronic works by freely sharing Project Gutenberg-tm works in compliance with the terms of this agreement for keeping the Project Gutenberg-tm name associated with the work. You can easily comply with the terms of this agreement by keeping this work in the same format with its attached full Project Gutenberg-tm License when you share it without charge with others.\n", "D. The copyright laws of the place where you are located also govern what you can do with this work. Copyright laws in most countries are in a constant state of change. If you are outside the United States, check the laws of your country in addition to the terms of this agreement before downloading, copying, displaying, performing, distributing or creating derivative works based on this work or any other Project Gutenberg-tm work. The Foundation makes no representations concerning the copyright status of any work in any country outside the United States.\n", "E. Unless you have removed all references to Project Gutenberg:\n", "E.1. The following sentence, with active links to, or other immediate access to, the full Project Gutenberg-tm License must appear prominently whenever any copy of a Project Gutenberg-tm work (any work on which the phrase \"Project Gutenberg\" appears, or with which the phrase \"Project Gutenberg\" is associated) is accessed, displayed, performed, viewed, copied or distributed:\n", "This eBook is for the use of anyone anywhere at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org\n", "E.2. If an individual Project Gutenberg-tm electronic work is derived from the public domain (does not contain a notice indicating that it is posted with permission of the copyright holder), the work can be copied and distributed to anyone in the United States without paying any fees or charges. If you are redistributing or providing access to a work with the phrase \"Project Gutenberg\" associated with or appearing on the work, you must comply either with the requirements of paragraphs 1.E.1 through 1.E.7 or obtain permission for the use of the work and the Project Gutenberg-tm trademark as set forth in paragraphs 1.E.8 or 1.E.9.\n", "E.3. If an individual Project Gutenberg-tm electronic work is posted with the permission of the copyright holder, your use and distribution must comply with both paragraphs 1.E.1 through 1.E.7 and any additional terms imposed by the copyright holder. Additional terms will be linked to the Project Gutenberg-tm License for all works posted with the permission of the copyright holder found at the beginning of this work.\n", "E.4. Do not unlink or detach or remove the full Project Gutenberg-tm License terms from this work, or any files containing a part of this work or any other work associated with Project Gutenberg-tm.\n", "E.5. Do not copy, display, perform, distribute or redistribute this electronic work, or any part of this electronic work, without prominently displaying the sentence set forth in paragraph 1.E.1 with active links or immediate access to the full terms of the Project Gutenberg-tm License.\n", "E.6. You may convert to and distribute this work in any binary, compressed, marked up, nonproprietary or proprietary form, including any word processing or hypertext form. However, if you provide access to or distribute copies of a Project Gutenberg-tm work in a format other than \"Plain Vanilla ASCII\" or other format used in the official version posted on the official Project Gutenberg-tm web site (www.gutenberg.org), you must, at no additional cost, fee or expense to the user, provide a copy, a means of exporting a copy, or a means of obtaining a copy upon request, of the work in its original \"Plain Vanilla ASCII\" or other form. Any alternate format must include the full Project Gutenberg-tm License as specified in paragraph 1.E.1.\n", "E.7. Do not charge a fee for access to, viewing, displaying, performing, copying or distributing any Project Gutenberg-tm works unless you comply with paragraph 1.E.8 or 1.E.9.\n", "E.8. You may charge a reasonable fee for copies of or providing access to or distributing Project Gutenberg-tm electronic works provided that\n", "You pay a royalty fee of 20% of the gross profits you derive from the use of Project Gutenberg-tm works calculated using the method you already use to calculate your applicable taxes. The fee is owed to the owner of the Project Gutenberg-tm trademark, but he has agreed to donate royalties under this paragraph to the Project Gutenberg Literary Archive Foundation. Royalty payments must be paid within 60 days following each date on which you prepare (or are legally required to prepare) your periodic tax returns. Royalty payments should be clearly marked as such and sent to the Project Gutenberg Literary Archive Foundation at the address specified in Section 4, \"Information about donations to the Project Gutenberg Literary Archive Foundation.\"\n", "You provide a full refund of any money paid by a user who notifies you in writing (or by e-mail) within 30 days of receipt that s/he does not agree to the terms of the full Project Gutenberg-tm License. You must require such a user to return or destroy all copies of the works possessed in a physical medium and discontinue all use of and all access to other copies of Project Gutenberg-tm works.\n", "You provide, in accordance with paragraph 1.F.3, a full refund of any money paid for a work or a replacement copy, if a defect in the electronic work is discovered and reported to you within 90 days of receipt of the work.\n", "You comply with all other terms of this agreement for free distribution of Project Gutenberg-tm works.\n", "E.9. If you wish to charge a fee or distribute a Project Gutenberg-tm electronic work or group of works on different terms than are set forth in this agreement, you must obtain permission in writing from both the Project Gutenberg Literary Archive Foundation and Michael Hart, the owner of the Project Gutenberg-tm trademark. Contact the Foundation as set forth in Section 3 below.\n", "F.\n", "F.1. Project Gutenberg volunteers and employees expend considerable effort to identify, do copyright research on, transcribe and proofread public domain works in creating the Project Gutenberg-tm collection. Despite these efforts, Project Gutenberg-tm electronic works, and the medium on which they may be stored, may contain \"Defects,\" such as, but not limited to, incomplete, inaccurate or corrupt data, transcription errors, a copyright or other intellectual property infringement, a defective or damaged disk or other medium, a computer virus, or computer codes that damage or cannot be read by your equipment.\n", "F.2. LIMITED WARRANTY, DISCLAIMER OF DAMAGES - Except for the \"Right of Replacement or Refund\" described in paragraph 1.F.3, the Project Gutenberg Literary Archive Foundation, the owner of the Project Gutenberg-tm trademark, and any other party distributing a Project Gutenberg-tm electronic work under this agreement, disclaim all liability to you for damages, costs and expenses, including legal fees. YOU AGREE THAT YOU HAVE NO REMEDIES FOR NEGLIGENCE, STRICT LIABILITY, BREACH OF WARRANTY OR BREACH OF CONTRACT EXCEPT THOSE PROVIDED IN PARAGRAPH F3. YOU AGREE THAT THE FOUNDATION, THE TRADEMARK OWNER, AND ANY DISTRIBUTOR UNDER THIS AGREEMENT WILL NOT BE LIABLE TO YOU FOR ACTUAL, DIRECT, INDIRECT, CONSEQUENTIAL, PUNITIVE OR INCIDENTAL DAMAGES EVEN IF YOU GIVE NOTICE OF THE POSSIBILITY OF SUCH DAMAGE.\n", "F.3. LIMITED RIGHT OF REPLACEMENT OR REFUND - If you discover a defect in this electronic work within 90 days of receiving it, you can receive a refund of the money (if any) you paid for it by sending a written explanation to the person you received the work from. If you received the work on a physical medium, you must return the medium with your written explanation. The person or entity that provided you with the defective work may elect to provide a replacement copy in lieu of a refund. If you received the work electronically, the person or entity providing it to you may choose to give you a second opportunity to receive the work electronically in lieu of a refund. If the second copy is also defective, you may demand a refund in writing without further opportunities to fix the problem.\n", "F.4. Except for the limited right of replacement or refund set forth in paragraph 1.F.3, this work is provided to you 'AS-IS' WITH NO OTHER WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTIBILITY OR FITNESS FOR ANY PURPOSE.\n", "F.5. Some states do not allow disclaimers of certain implied warranties or the exclusion or limitation of certain types of damages. If any disclaimer or limitation set forth in this agreement violates the law of the state applicable to this agreement, the agreement shall be interpreted to make the maximum disclaimer or limitation permitted by the applicable state law. The invalidity or unenforceability of any provision of this agreement shall not void the remaining provisions.\n", "F.6. INDEMNITY - You agree to indemnify and hold the Foundation, the trademark owner, any agent or employee of the Foundation, anyone providing copies of Project Gutenberg-tm electronic works in accordance with this agreement, and any volunteers associated with the production, promotion and distribution of Project Gutenberg-tm electronic works, harmless from all liability, costs and expenses, including legal fees, that arise directly or indirectly from any of the following which you do or cause to occur: (a) distribution of this or any Project Gutenberg-tm work, (b) alteration, modification, or additions or deletions to any Project Gutenberg-tm work, and (c) any Defect you cause.\n", "Section 2. Information about the Mission of Project Gutenberg-tm\n", "Project Gutenberg-tm is synonymous with the free distribution of electronic works in formats readable by the widest variety of computers including obsolete, old, middle-aged and new computers. It exists because of the efforts of hundreds of volunteers and donations from people in all walks of life.\n", "Volunteers and financial support to provide volunteers with the assistance they need, is critical to reaching Project Gutenberg-tm's goals and ensuring that the Project Gutenberg-tm collection will remain freely available for generations to come. In 2001, the Project Gutenberg Literary Archive Foundation was created to provide a secure and permanent future for Project Gutenberg-tm and future generations. To learn more about the Project Gutenberg Literary Archive Foundation and how your efforts and donations can help, see Sections 3 and 4 and the Foundation web page at http://www.pglaf.org.\n", "Section 3. Information about the Project Gutenberg Literary Archive Foundation\n", "The Project Gutenberg Literary Archive Foundation is a non profit 501(c)(3) educational corporation organized under the laws of the state of Mississippi and granted tax exempt status by the Internal Revenue Service. The Foundation's EIN or federal tax identification number is 64-6221541. Its 501(c)(3) letter is posted at http://pglaf.org/fundraising. Contributions to the Project Gutenberg Literary Archive Foundation are tax deductible to the full extent permitted by U.S. federal laws and your state's laws.\n", "The Foundation's principal office is located at 4557 Melan Dr. S. Fairbanks, AK, 99712., but its volunteers and employees are scattered throughout numerous locations. Its business office is located at 809 North 1500 West, Salt Lake City, UT 84116, (801) 596-1887, email business@pglaf.org. Email contact links and up to date contact information can be found at the Foundation's web site and official page at http://pglaf.org\n", "For additional contact information: Dr. Gregory B. Newby Chief Executive and Director gbnewby@pglaf.org\n", "Section 4. Information about Donations to the Project Gutenberg Literary Archive Foundation\n", "Project Gutenberg-tm depends upon and cannot survive without wide spread public support and donations to carry out its mission of increasing the number of public domain and licensed works that can be freely distributed in machine readable form accessible by the widest array of equipment including outdated equipment. Many small donations ($1 to $5,000) are particularly important to maintaining tax exempt status with the IRS.\n", "The Foundation is committed to complying with the laws regulating charities and charitable donations in all 50 states of the United States. Compliance requirements are not uniform and it takes a considerable effort, much paperwork and many fees to meet and keep up with these requirements. We do not solicit donations in locations where we have not received written confirmation of compliance. To SEND DONATIONS or determine the status of compliance for any particular state visit http://pglaf.org\n", "While we cannot and do not solicit contributions from states where we have not met the solicitation requirements, we know of no prohibition against accepting unsolicited donations from donors in such states who approach us with offers to donate.\n", "International donations are gratefully accepted, but we cannot make any statements concerning tax treatment of donations received from outside the United States. U.S. laws alone swamp our small staff.\n", "Please check the Project Gutenberg Web pages for current donation methods and addresses. Donations are accepted in a number of other ways including checks, online payments and credit card donations. To donate, please visit: http://pglaf.org/donate\n", "Section 5. General Information About Project Gutenberg-tm electronic works.\n", "Professor Michael S. Hart is the originator of the Project Gutenberg-tm concept of a library of electronic works that could be freely shared with anyone. For thirty years, he produced and distributed Project Gutenberg-tm eBooks with only a loose network of volunteer support.\n", "Project Gutenberg-tm eBooks are often created from several printed editions, all of which are confirmed as Public Domain in the U.S. unless a copyright notice is included. Thus, we do not necessarily keep eBooks in compliance with any particular paper edition.\n", "Most people start at our Web site which has the main PG search facility:\n", "http://www.gutenberg.org\n", "This Web site includes information about Project Gutenberg-tm, including how to make donations to the Project Gutenberg Literary Archive Foundation, how to help produce our new eBooks, and how to subscribe to our email newsletter to hear about new eBooks. \n"];

var _extends = Object.assign || function (target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];

    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  }

  return target;
};

// TODO
//
// - some kind of visual bell when input is disallowed (letter at end of line,
// backspace at beginning of text, etc)
//
// - fix backspace behaviour immediately following enter
//
// - tab support
//
// - delete by word support

var newLineChar = ['span', {}, '\n'];

var text = compose(prop('text'), reduce(function (_ref, x) {
  var text = _ref.text,
      line = _ref.line,
      char = _ref.char;
  return x === '\n' ? {
    text: append([], adjust(append({ target: ' ', line: line, char: char }), length(text) - 1, text)),
    line: line + 1,
    char: 0
  } : {
    text: adjust(append({ target: x, line: line, char: char }), length(text) - 1, text),
    line: line,
    char: char + 1
  };
}, { text: [[]], line: 0, char: 0 }), splitEvery(1));

var choose = function choose(x) {
  return x[Math.round(Math.random() * length(x))];
};

var state = {
  text: text(choose(texts)),
  cursor: { line: 0, char: 0 },
  strokes: 0,
  errors: 0
};

var onChar = function onChar(key, _ref2) {
  var text = _ref2.text,
      _ref2$cursor = _ref2.cursor,
      line = _ref2$cursor.line,
      char = _ref2$cursor.char,
      started = _ref2.started,
      strokes = _ref2.strokes,
      errors = _ref2.errors;

  // A job for lenses? http://ramdajs.com/docs/#lens
  if (char >= length(text[line]) - 1) {
    return {
      text: text,
      cursor: { line: line, char: char },
      strokes: strokes + 1,
      errors: errors + 1
    };
  }
  return {
    text: update(line, update(char, merge(text[line][char], { input: key }), text[line]), text),
    cursor: { line: line, char: char + 1 },
    started: started || Date.now(),
    strokes: strokes + 1,
    errors: errors + (key === text[line][char].target ? 0 : 1)
  };
};

var onEnter = function onEnter(_ref3) {
  var text = _ref3.text,
      _ref3$cursor = _ref3.cursor,
      line = _ref3$cursor.line,
      char = _ref3$cursor.char,
      started = _ref3.started;

  if (line >= length(text) - 1) {
    return { text: text, cursor: { line: line, char: char } };
  }
  return {
    text: update(line, update(char, merge(text[line][char], { input: ' ' }), text[line]), text),
    cursor: { line: line + 1, char: 0 }
  };
};

var onBackspace = function onBackspace(_ref4) {
  var text = _ref4.text,
      _ref4$cursor = _ref4.cursor,
      line = _ref4$cursor.line,
      char = _ref4$cursor.char;

  if (char <= 0 && line > 0) {
    line--;
    char = min(length(takeWhile(prop('input'), text[line])), length(text[line]) - 1);
  } else if (char > 0) {
    char--;
  }
  return {
    text: update(line, update(char, merge(text[line][char], { input: undefined }), text[line]), text),
    cursor: { line: line, char: char }
  };
};

var isModified = function isModified(event) {
  return event.altKey || event.ctrlKey || event.metaKey;
};

var isComplete = all(all(function (_ref5) {
  var target = _ref5.target,
      input = _ref5.input;
  return target === input;
}));

var checkComplete = function checkComplete(state) {
  return _extends({
    completed: isComplete(state.text) && Date.now()
  }, state);
};

var actions = {
  keydown: function keydown(event) {
    return function (state) {
      if (state.completed) {
        return;
      }
      if (length(event.key) === 1 && !isModified(event)) {
        event.preventDefault();
        return checkComplete(onChar(event.key, state));
      } else if (event.key === 'Enter') {
        return checkComplete(onEnter(state));
      } else if (event.key === 'Backspace') {
        return onBackspace(state);
      }
    };
  }
};

var Char = function Char(cursor) {
  return function (_ref6) {
    var target = _ref6.target,
        input = _ref6.input,
        line = _ref6.line,
        char = _ref6.char;
    return cursor.line === line && cursor.char === char ? ['span', { class: 'cursor' }, target] : input ? input === target ? ['span', { class: 'correct' }, input] : ['span', { class: 'error' }, input === ' ' ? '_' : input] : ['span', {}, target];
  };
};

var Text = function Text(_ref7) {
  var text = _ref7.text,
      cursor = _ref7.cursor;
  return reduce(function (acc, ln) {
    return append(newLineChar, concat(acc, map(Char(cursor), ln)));
  }, [], text);
};

var Results = function Results(_ref8) {
  var text = _ref8.text,
      complete = _ref8.complete,
      started = _ref8.started,
      completed = _ref8.completed,
      strokes = _ref8.strokes,
      errors = _ref8.errors;

  if (!completed) {
    return [];
  }
  var seconds = (completed - started) / 1000;
  var words = reduce(function (sum, line) {
    return sum + length(line);
  }, 0, text) / 5;
  var wpm = 60 * words / seconds;
  var accuracy = 100 * (strokes - errors) / strokes;
  return ['div', {}, [['span', {}, 'typed ' + Math.round(words) + ' words at '], ['span', { class: 'highlight' }, Math.round(wpm) + 'wpm '], ['span', {}, 'with '], ['span', { class: 'highlight' }, Math.round(accuracy) + '% '], ['span', {}, 'accuracy']]];
};

var view$2 = function view(state, actions) {
  return h$1('name', 'props', 'children')(['div', {
    class: 'text',
    oncreate: function oncreate() {
      return window.addEventListener('keydown', actions.keydown);
    }
  }, [Text(state), Results(state, actions)]]);
};

window.main = app(state, actions, view$2, document.body);

}());
