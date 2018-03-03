import { app } from 'hyperapp'
import { h } from 'ijk'
import {
  adjust,
  append,
  compose,
  concat,
  length,
  map,
  merge,
  min,
  prop,
  reduce,
  splitEvery,
  takeWhile,
  update
} from 'ramda'

// TODO some kind of visual bell when input is disallowed (letter at end of
// line, backspace at beginning of text, etc)

// TODO get appropriate texts from somewhere

// TODO track accuracy and time, display on completion

// TODO focus a hidden textarea so that we can type `'` etc without triggering
// shortcuts in firefox

const newLineChar = ['span', {}, '\n']

const text = compose(
  prop('text'),
  reduce(
    ({ text, line, char }, x) => x === '\n'
      ? {
        text: append(
          [],
          adjust(
            append({ target: ' ', line, char }),
            length(text) - 1,
            text
          )
        ),
        line: line + 1,
        char: 0
      }
      : {
        text: adjust(
          append({ target: x, line, char }),
          length(text) - 1,
          text
        ),
        line,
        char: char + 1
      },
    { text: [[]], line: 0, char: 0 }
  ),
  splitEvery(1)
)

const state = {
  text: text(`Returns a curried equivalent of the provided function. The curried function has two unusual capabilities. First, its arguments needn't be provided one at a time. If f is a ternary function and g is R.curry(f), the following are equivalent:

    g(1)(2)(3)
    g(1)(2, 3)
    g(1, 2)(3)
    g(1, 2, 3)

Secondly, the special placeholder value R.__ may be used to specify "gaps", allowing partial application of any combination of arguments, regardless of their positions. If g is as above and _ is R.__, the following are equivalent:`),
  cursor: { line: 0, char: 0 }
}

const onChar = key => ({ text, cursor: { line, char } }) => {
  // A job for lenses? http://ramdajs.com/docs/#lens
  if (char >= length(text[line]) - 1) {
    return { text, cursor: { line, char } }
  }
  return {
    text: update(
      line,
      update(char, merge(text[line][char], { input: key }), text[line]),
      text
    ),
    cursor: { line, char: char + 1 }
  }
}

const onEnter = ({ text, cursor: { line, char } }) => {
  if (line >= length(text) - 1) {
    return { text, cursor: { line, char } }
  }
  return {
    text: update(
      line,
      update(char, merge(text[line][char], { input: ' ' }), text[line]),
      text
    ),
    cursor: { line: line + 1, char: 0 }
  }
}

const onBackspace = ({ text, cursor: { line, char } }) => {
  if (char <= 0 && line > 0) {
    line--
    char = min(
      length(takeWhile(prop('input'), text[line])),
      length(text[line]) - 1
    )
  } else if (char > 0) {
    char--
  }
  return {
    text: update(
      line,
      update(
        char,
        merge(text[line][char], { input: undefined }),
        text[line]
      ),
      text
    ),
    cursor: { line, char }
  }
}

const isModified = event => event.altKey || event.ctrlKey || event.metaKey

const actions = {
  keydown: event => {
    console.log('event:', event)
    if (length(event.key) === 1 && !isModified(event)) {
      event.preventDefault()
      return onChar(event.key)
    } else if (event.key === 'Enter') {
      return onEnter
    } else if (event.key === 'Backspace') {
      return onBackspace
    }
  }
}

const Char = cursor => ({ target, input, line, char }) =>
  cursor.line === line && cursor.char === char
    ? ['span', { class: 'cursor' }, target]
    : input
      ? input === target
        ? ['span', { class: 'correct' }, input]
        : ['span', { class: 'error' }, input === ' ' ? '_' : input]
      : ['span', {}, target]

const Text = ({ text, cursor }) => reduce(
  (acc, ln) => append(newLineChar, concat(acc, map(Char(cursor), ln))),
  [],
  text
)

const view = (state, actions) => h('name', 'props', 'children')([
  'div',
  {
    class: 'text',
    oncreate: () => window.addEventListener('keydown', actions.keydown)
  },
  Text(state)
])

window.main = app(state, actions, view, document.body)
