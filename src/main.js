import { app } from 'hyperapp'
import { h } from 'ijk'
import {
  adjust,
  all,
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
  takeWhile
} from 'ramda'

import texts from './tao-te-ching.json'

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
//
// - graph previous results

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

const choose = x => x[Math.round(Math.random() * length(x))]

const state = {
  text: text(choose(texts)),
  cursor: { line: 0, char: 0 },
  strokes: 0,
  errors: 0
}

const onChar = (
  key,
  { text, cursor: { line, char }, started, strokes, errors }
) => {
  // A job for lenses? http://ramdajs.com/docs/#lens
  if (char >= length(text[line]) - 1) {
    return {
      text,
      cursor: { line, char },
      strokes: strokes + 1,
      errors: errors + 1
    }
  }
  return {
    text: adjust(
      l => adjust(c => merge(c, { input: key }), char, l),
      line,
      text
    ),
    cursor: { line, char: char + 1 },
    started: started || Date.now(),
    strokes: strokes + 1,
    errors: errors + (key === text[line][char].target ? 0 : 1)
  }
}

const onEnter = ({ text, cursor: { line, char }, ...rest }) => {
  // TODO this should also increment strokes and errors
  if (line >= length(text) - 1) {
    return { text, cursor: { line, char }, ...rest }
  }
  return {
    text: adjust(
      l => adjust(c => merge(c, { input: ' ' }), char, l),
      line,
      text
    ),
    cursor: { line: line + 1, char: 0 },
    ...rest
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
    text: adjust(
      l => adjust(c => merge(c, { input: undefined }), char, l),
      line,
      text
    ),
    cursor: { line, char }
  }
}

const isModified = event => event.altKey || event.ctrlKey || event.metaKey

const isComplete = all(all(({ target, input }) => target === input))

const checkComplete = state => {
  if (!isComplete(state.text)) {
    return state
  }
  const seconds = (Date.now() - state.started) / 1000
  const words = reduce((sum, line) => sum + length(line), 0, state.text) / 5
  const wpm = 60 * words / seconds
  const accuracy = 100 * (state.strokes - state.errors) / state.strokes
  return {
    completed: true,
    words,
    wpm,
    accuracy,
    ...state
  }
}

const actions = {
  keydown: event => state => {
    if (state.completed) {
      return
    }
    if (length(event.key) === 1 && !isModified(event)) {
      event.preventDefault()
      return checkComplete(onChar(event.key, state))
    } else if (event.key === 'Enter') {
      return checkComplete(onEnter(state))
    } else if (event.key === 'Backspace') {
      return onBackspace(state)
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

const Results = ({ completed, words, wpm, accuracy }) => {
  if (!completed) {
    return []
  }
  return [
    `div`,
    {},
    [
      ['span', {}, `typed ${Math.round(words)} words at `],
      ['span', { class: 'wpm' }, `${Math.round(wpm)}wpm `],
      ['span', {}, 'with '],
      ['span', { class: 'accuracy' }, `${Math.round(accuracy)}% `],
      ['span', {}, 'accuracy']
    ]
  ]
}

const view = (state, actions) => h('name', 'props', 'children')([
  'div',
  {},
  [
    [
      'div',
      {},
      [
        [
          'a',
          { class: 'left', href: 'http://www.gutenberg.org/ebooks/216' },
          '[project gutenberg]'
        ],
        [
          'a',
          { class: 'right', href: 'https://github.com/hot-leaf-juice/gghf' },
          '[source]'
        ]
      ]
    ],
    [
      'div',
      {
        class: 'text',
        oncreate: () => window.addEventListener('keydown', actions.keydown)
      },
      [
        Text(state),
        Results(state, actions)
      ]
    ]
  ]
])

window.main = app(state, actions, view, document.body)
