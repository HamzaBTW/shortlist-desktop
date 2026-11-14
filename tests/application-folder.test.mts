import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applicationFolderFor } from '../src/shared/documents.ts'

test('a drafted file points to its application folder', () => {
  assert.equal(applicationFolderFor('cv/main_property_finder_engineering_graduate_trainee.pdf'), 'cv/property_finder_engineering_graduate_trainee')
  assert.equal(applicationFolderFor('cover_letters/cover_uber_data_analytics_intern.tex'), 'cv/uber_data_analytics_intern')
  assert.equal(applicationFolderFor("cv/acme_designer/Jane's CV.pdf"), 'cv/acme_designer')
  assert.equal(applicationFolderFor('cv/main_example.tex'), 'cv/example')
  assert.equal(applicationFolderFor('cv/notes.pdf'), null)
})
