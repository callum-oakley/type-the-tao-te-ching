import { app } from 'hyperapp'
import { h } from 'ijk'

/* Just for testing */
const rawText =
  'The quick brown fox jumps over the lazy dog.\n' +
  'This is another line!\n' +
  '\n' +
  'The line above is empty :o\n' +
  'The quick brown fox jumps over the lazy dog.'

const text = [[]]
let i = 0
for (const c of rawText) {
  if (c === '\n') {
    i++
    text.push([])
  } else {
    text[i].push(c)
  }
}
/* * * * */

const newLine = ['span', {}, '\n']

const state = {
  text,
  input: [[]]
}

const actions = {
  keydown: ({ key }) => ({ input }) => {
    const line = input.length - 1
    const char = input[line].length - 1
    console.log(key)
    if (key === 'Enter') {
      return { input: [...input, []] }
    } else if (key === 'Backspace' && line > 0 && char <= 0) {
      return { input: input.slice(0, line) }
    } else if (key === 'Backspace') {
      return { input: [...input.slice(0, line), input[line].slice(0, char)] }
    } else if (key.length === 1) {
      return { input: [...input.slice(0, line), [...input[line], key]] }
    }
  }
}

const Char = ({ text, input }, c, line, char) => {
  const cursorLine = input.length - 1
  const cursorChar = input[cursorLine].length
  if (line > cursorLine || (line === cursorLine && char > cursorChar)) {
    return ['span', {}, c]
  } else if (cursorLine === line && cursorChar === char) {
    return ['span', { class: 'cursor' }, c]
  } else if (text.length <= line || text[line].length <= char) {
    return ['span', { class: 'error' }, c]
  } else if (text[line][char] !== input[line][char]) {
    return ['span', { class: 'error' }, c]
  } else {
    return ['span', { class: 'correct' }, c]
  }
}

const Chars = state => state.text
  .reduce((acc, line, i) => [
    ...acc,
    ...line.map((c, j) => Char(state, c, i, j)),
    newLine
  ], [])

const view = (state, actions) => h('name', 'props', 'children')([
  'div',
  {
    class: 'text',
    oncreate: () => window.addEventListener('keydown', actions.keydown)
  },
  Chars(state)]
)

window.main = app(state, actions, view, document.body)
