import { readFileSync, writeFileSync } from 'fs'
import { basename } from 'path'
import {
  compose,
  dropWhile,
  filter,
  join,
  map,
  replace,
  split
} from 'ramda'

const readText = path => readFileSync(path, { encoding: 'utf8' })

const reflow = compose(join(' '), split(/\r?\n/))

const stripHeading = dropWhile(c => !c.match(/[a-zA-Z]/))

const normalizeSpace = replace(/\s+/g, ' ')

const paragraphs = compose(
  map(t => t + '\n'),
  filter(p => p !== ''),
  map(normalizeSpace),
  map(stripHeading),
  map(reflow),
  split(/\r?\n\r?\n/)
)

const writeJSON = (path, data) => {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

const path = process.argv[2]
writeJSON(`src/${basename(path, '.txt')}.json`, paragraphs(readText(path)))
