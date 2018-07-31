import { app } from 'hyperapp'
import { h } from 'ijk'
import {
  addIndex,
  adjust,
  all,
  append,
  compose,
  join,
  length,
  map,
  merge,
  prop,
  reduce,
  splitEvery
} from 'ramda'

import texts from './texts.json'

const CHART_X = 1000
const CHART_Y = 200

const mapIndexed = addIndex(map)

const text = compose(
  prop('text'),
  reduce(
    ({ text, char }, x) => ({
      text: append({ target: x, char }, text),
      char: char + 1
    }),
    { text: [], char: 0 }
  ),
  splitEvery(1)
)

const choose = x => x[Math.round(Math.random() * length(x))]

const initialState = () => ({
  text: text(choose(texts)),
  cursor: 0,
  started: undefined,
  strokes: 0,
  errors: 0,
  completed: false
})

const onChar = (key, { text, cursor, started, strokes, errors }) => {
  if (cursor >= length(text)) {
    return {
      text,
      cursor,
      strokes: strokes + 1,
      errors: errors + 1
    }
  }
  return {
    text: adjust(c => merge(c, { input: key }), cursor, text),
    cursor: cursor + 1,
    started: started || Date.now(),
    strokes: strokes + 1,
    errors: errors + (key === text[cursor].target ? 0 : 1)
  }
}

const onBackspace = ({ text, cursor }) => {
  if (cursor > 0) {
    cursor--
  }
  return {
    text: adjust(c => merge(c, { input: undefined }), cursor, text),
    cursor
  }
}

const isModified = event => event.altKey || event.ctrlKey || event.metaKey

const isComplete = all(({ target, input }) => target === input)

const checkComplete = state => {
  if (!isComplete(state.text)) {
    return state
  }
  const seconds = (Date.now() - state.started) / 1000
  const words = length(state.text) / 5
  const wpm = (60 * words) / seconds
  const accuracy = (100 * (state.strokes - state.errors)) / state.strokes
  const score = { wpm, accuracy }
  const localData = window.localStorage.getItem('history')
  const history = append(score, localData ? JSON.parse(localData) : [])
  window.localStorage.setItem('history', JSON.stringify(history))
  return merge(state, { completed: true, words, score, history })
}

const actions = {
  keydown: event => state => {
    if (state.completed && event.key === 'Enter') {
      event.preventDefault()
      return initialState()
    } else if (state.completed) {
    } else if (length(event.key) === 1 && !isModified(event)) {
      event.preventDefault()
      return checkComplete(onChar(event.key, state))
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      return onBackspace(state)
    }
  },
  toggleBrightness: () => {
    toggleBodyDarkness()
    toggleSpanBrightness()
  }
}

const toggleBodyDarkness = () => {
  const body = document.getElementsByTagName('body')[0]
  body.classList.contains('dark') ? body.classList.remove('dark') : body.classList.add('dark')
}

const toggleSpanBrightness = () => {
  const span = document.getElementsByTagName('span')
  for (let i = 0; i < span.length; i++) {
    span[i].classList.contains('dark') ? span[i].classList.remove('dark') : span[i].classList.add('dark')
  }
}

const dark = (baseClass) => {
  if (document.getElementsByTagName('body')[0].classList.contains('dark')) {
    return `${baseClass} dark`.trim()
  }
  return `${baseClass}`
}

const Char = cursor => ({ target, input, char }) =>
  cursor === char
    ? ['span', { class: dark('cursor') }, target]
    : input
      ? input === target
        ? ['span', { class: dark('correct') }, input]
        : ['span', { class: dark('error') }, input === ' ' ? '_' : input]
      : ['span', { class: dark('') }, target]

const Text = ({ text, cursor }) => ['div', {}, map(Char(cursor), text)]

const pathString = data => {
  const xStep = CHART_X / (length(data) - 1)
  const dMin = Math.min(...data)
  const dMax = Math.max(...data)
  const dRange = dMax - dMin
  return (
    'M ' +
    join(
      ' L ',
      mapIndexed(
        (d, i) => `${i * xStep},${(CHART_Y * (d - dMin)) / dRange}`,
        data
      )
    )
  )
}

const Chart = ({ pathClass, data }) => [
  'svg',
  {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${CHART_X} ${CHART_Y}`
  },
  [
    [
      'path',
      {
        class: pathClass,
        transform: `translate(0, ${CHART_Y}) scale(1, -1)`,
        d: pathString(data)
      },
      ''
    ]
  ]
]

const Results = ({ completed, words, score, history }) => {
  if (!completed) {
    return []
  }
  return [
    `div`,
    {},
    [
      [
        'div',
        {},
        [
          ['span', {}, `\ntyped ${Math.round(words)} words at `],
          ['span', { class: 'wpm' }, `${Math.round(score.wpm)}wpm `],
          ['span', {}, 'with '],
          ['span', { class: 'accuracy' }, `${Math.round(score.accuracy)}% `],
          ['span', {}, 'accuracy \u2013 hit enter to restart']
        ]
      ],
      [
        'div',
        { class: 'charts' },
        [
          Chart({ pathClass: 'wpm', data: map(prop('wpm'), history) }),
          Chart({ pathClass: 'accuracy', data: map(prop('accuracy'), history) })
        ]
      ]
    ]
  ]
}

const view = (state, actions) =>
  h('name', 'props', 'children')([
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
            {
              class: 'right',
              href: 'https://github.com/callum-oakley/type-the-tao-te-ching'
            },
            '[source]'
          ],
          [
            'a',
            {
              class: 'right brightness',
              href: '#',
              onclick: () => actions.toggleBrightness()
            },
            '[brightness]'
          ]
        ]
      ],
      [
        'div',
        {
          class: 'center-column',
          oncreate: () => window.addEventListener('keydown', actions.keydown)
        },
        [Text(state), Results(state, actions)]
      ]
    ]
  ])

window.main = app(initialState(), actions, view, document.body)
