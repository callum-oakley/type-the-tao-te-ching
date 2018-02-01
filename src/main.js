import { app } from 'hyperapp'
import { h } from 'ijk'
import {
  append,
  concat,
  length,
  map,
  merge,
  min,
  prop,
  reduce,
  takeWhile,
  update
} from 'ramda'

// TODO some kind of visual bell when input is disallowed (letter at end of
// line, backspace at beginning of text, etc)

// TODO construct initial state from a string.

// TODO get appropriate texts from somewhere

// TODO track accuracy and time, display on completion

const newLineChar = ['span', {}, '\n']

const state = {
  text: [
    [
      { target: 'H', line: 0, char: 0 },
      { target: 'e', line: 0, char: 1 },
      { target: 'l', line: 0, char: 2 },
      { target: 'l', line: 0, char: 3 },
      { target: 'o', line: 0, char: 4 },
      { target: ' ', line: 0, char: 5 }
    ],
    [
      { target: 'w', line: 1, char: 0 },
      { target: 'o', line: 1, char: 1 },
      { target: 'r', line: 1, char: 2 },
      { target: 'l', line: 1, char: 3 },
      { target: 'd', line: 1, char: 4 },
      { target: '.', line: 1, char: 5 },
      { target: ' ', line: 1, char: 6 }
    ]
  ],
  cursor: { line: 0, char: 0 }
}

const onLetter = key => ({ text, cursor: { line, char } }) => {
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
    char = min(length(takeWhile(prop('input'), text[line])), length(text[line]) - 1)
  } else if (char > 0) {
    char--
  }
  return {
    text: update(
      line,
      update(char, merge(text[line][char], { input: undefined }), text[line]),
      text
    ),
    cursor: { line, char }
  }
}

const actions = {
  keydown: ({ key }) => {
    console.log(`key: '${key}'`)
    if (length(key) === 1) {
      return onLetter(key)
    } else if (key === 'Enter') {
      return onEnter
    } else if (key === 'Backspace') {
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
