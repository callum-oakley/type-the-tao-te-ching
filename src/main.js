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
  takeWhile,
  update
} from 'ramda'

// TODO
//
// - some kind of visual bell when input is disallowed (letter at end of line,
// backspace at beginning of text, etc)
//
// - get appropriate texts from somewhere
//
// - track accuracy
//
// - track time
//
// - display accuracy and time on completion
//
// - focus a hidden textarea so that we can type `'` etc without triggering
// shortcuts in firefox
//
// - tab support
//
// - delete by word support
//
// - fix backspace behaviour immediately following enter

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
  text: text(
`Old pond
frog jumped in
sound of water
`
  ),
  cursor: { line: 0, char: 0 }
}

const onChar = (key, { text, cursor: { line, char }, started }) => {
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
    cursor: { line, char: char + 1 },
    started: started || Date.now()
  }
}

const onEnter = ({ text, cursor: { line, char }, started }) => {
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

const isComplete = all(all(({ target, input }) => target === input))

const checkComplete = state => ({
  completed: isComplete(state.text) && Date.now(),
  ...state
})

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

const Results = ({ text, complete, started, completed }) => completed
  ? [
    'div',
    {},
    `Completed in ${(completed - started) / 1000}s.`
  ]
  : []

const view = (state, actions) => h('name', 'props', 'children')([
  'div',
  {
    class: 'text',
    oncreate: () => window.addEventListener('keydown', actions.keydown)
  },
  [
    Text(state),
    Results(state, actions)
  ]
])

window.main = app(state, actions, view, document.body)
