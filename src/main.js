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
//
// - get a random text on each load

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
`In 1993, the National Center for Supercomputing Applications (NCSA), a unit of the University of Illinois at Urbana-Champaign, released NCSA Mosaic, the first popular graphical Web browser, which played an important part in expanding the growth of the nascent World Wide Web. In 1994, a company called Mosaic Communications was founded in Mountain View, California and employed many of the original NCSA Mosaic authors to create Mosaic Netscape. However, it intentionally shared no code with NCSA Mosaic. The internal codename for the company's browser was Mozilla, which stood for "Mosaic killer", as the company's goal was to displace NCSA Mosaic as the world's number one web browser. The first version of the Web browser, Mosaic Netscape 0.9, was released in late 1994. Within four months it had already taken three-quarters of the browser market and became the main browser for the Internet in the 1990s. To avoid trademark ownership problems with the NCSA, the browser was subsequently renamed Netscape Navigator in the same year, and the company took the name Netscape Communications. Netscape Communications realized that the Web needed to become more dynamic. Marc Andreessen, the founder of the company believed that HTML needed a "glue language" that was easy to use by Web designers and part-time programmers to assemble components such as images and plugins, where the code could be written directly in the Web page markup.

In 1995, Netscape Communications recruited Brendan Eich with the goal of embedding the Scheme programming language into its Netscape Navigator.[8] Before he could get started, Netscape Communications collaborated with Sun Microsystems to include in Netscape Navigator Sun's more static programming language Java, in order to compete with Microsoft for user adoption of Web technologies and platforms.[9] Netscape Communications then decided that the scripting language they wanted to create would complement Java and should have a similar syntax, which excluded adopting other languages such as Perl, Python, TCL, or Scheme. To defend the idea of JavaScript against competing proposals, the company needed a prototype. Eich wrote one in 10 days, in May 1995.

Although it was developed under the name Mocha, the language was officially called LiveScript when it first shipped in beta releases of Netscape Navigator 2.0 in September 1995, but it was renamed JavaScript[2] when it was deployed in the Netscape Navigator 2.0 beta 3 in December.[10] The final choice of name caused confusion, giving the impression that the language was a spin-off of the Java programming language, and the choice has been characterized[11] as a marketing ploy by Netscape to give JavaScript the cachet of what was then the hot new Web programming language.

There is a common misconception that JavaScript was influenced by an earlier Web page scripting language developed by Nombas named Cmm (not to be confused with the later C-- created in 1997).[12][13] Brendan Eich, however, had never heard of Cmm before he created LiveScript.[14] Nombas did pitch their embedded Web page scripting to Netscape, though Web page scripting was not a new concept, as shown by the ViolaWWW Web browser.[15] Nombas later switched to offering JavaScript instead of Cmm in their ScriptEase product and was part of the TC39 group that standardized ECMAScript.[16]
`
  ),
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
    text: update(
      line,
      update(char, merge(text[line][char], { input: key }), text[line]),
      text
    ),
    cursor: { line, char: char + 1 },
    started: started || Date.now(),
    strokes: strokes + 1,
    errors: errors + key === text[line][char].target ? 0 : 1
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

const Results = ({ text, complete, started, completed, strokes, errors }) => {
  if (!completed) {
    return []
  }
  const seconds = (completed - started) / 1000
  const words = reduce((sum, line) => sum + length(line), 0, text) / 5
  const wpm = 60 * words / seconds
  const accuracy = 100 * (strokes - errors) / strokes
  return [
    `div`,
    {},
    [
      ['span', {}, `typed ${Math.round(words)} words at `],
      ['span', { class: 'highlight' }, `${Math.round(wpm)}wpm `],
      ['span', {}, 'with '],
      ['span', { class: 'highlight' }, `${Math.round(accuracy)}%`],
      ['span', {}, 'accuracy']
    ]
  ]
}

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
