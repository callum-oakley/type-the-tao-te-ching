import resolve from 'rollup-plugin-node-resolve'
import babel from 'rollup-plugin-babel'
import json from 'rollup-plugin-json'

export default {
  input: 'src/main.js',
  output: {
    file: 'build/index.js',
    format: 'iife'
  },
  plugins: [
    json(),
    resolve(),
    babel({
      babelrc: false,
      presets: [
        [
          'env',
          {
            modules: false
          }
        ]
      ],
      plugins: [
        'external-helpers',
        'transform-object-rest-spread'
      ],
      exclude: [
        'node_modules/**'
      ]
    })
  ]
}
