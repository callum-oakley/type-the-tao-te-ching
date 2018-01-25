import { app } from 'hyperapp'
import { h } from 'ijk'

const state = { count: 0 }

const actions = {
  down: v => state => ({ count: state.count - v }),
  up: v => state => ({ count: state.count + v })
}

const view = (state, actions) => h('name', 'props', 'children')(
  ['div', {}, [
    ['h1', {}, state.count],
    ['button', { onclick: () => actions.down(1) }, '-'],
    ['button', { onclick: () => actions.up(1) }, '+']
  ]]
)

window.main = app(state, actions, view, document.body)
