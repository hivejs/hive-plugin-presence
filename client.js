/**
 * hive.js
 * Copyright (C) 2013-2015 Marcel Klehr <mklehr@gmx.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var jsonParse = require('json-stream')
  , through = require('through2')
  , vdom = require('virtual-dom')
  , h = vdom.h
  , ObservVarhash = require('observ-varhash')
  , ObservStruct = require('observ-struct')
  , ObservEmitter = require('observ-emitter')

module.exports = setup
module.exports.consumes = ['ui', 'editor', 'models', 'hooks']
module.exports.provides = ['presence'] // used by cursor broadcast plugin
function setup(plugin, imports, register) {
  var ui = imports.ui
    , models = imports.models
    , hooks = imports.hooks

  hooks.on('ui:initState', function*() {
    ui.state.events.put('presence:renderUser', ObservEmitter())
  })

  ui.page('/documents/:id', function(ctx, next) {
    ui.state.events['editor:load'].listen(function(editableDocument) {
      ui.state.put('presence', ObservStruct({
        users: ObservVarhash()
      }))
      var state = ui.state.presence
      state.users.put(ui.state.user.get('id'), ui.state.user)

      var broadcast = ctx.broadcast.createDuplexStream(new Buffer('presence'))
      broadcast.pipe(jsonParse()).pipe(through.obj(function(list, enc, cb) {
        // Update models
        Object.keys(list).forEach(function(userId) {
          if(userId == ui.state.user.get('id')) return
          if(!state.users[userId]) {
            var user = new ctx.models.user(list[userId])
            state.users.put(userId, models.toObserv(user))
            user.fetch()
          }
        })
        cb()
      }))

      // fetch users regularly
      setInterval(function() {
        Object.keys(state.users).forEach(function(userId) {
          state.users[userId].fetch()
        })
      }, 10000)

      // inject into page
      ui.state.events['ui:renderBody'].listen(function(state, children) {
        children.unshift(render(state))
      })
    })

    next()
  })

  register(null, {presence: {}})
}

function render(state) {
  return h('div.Presence', [
    h('h5.Presence__Title', [Object.keys(state.presence.users).length+' Users ', h('small', 'currently viewing this document')]),
    h('ul.Presence__Users.list-unstyled', Object.keys(state.presence.users).map(function(userId) {
      return renderUser(state, state.presence.users[userId])
    }))
  ])
}

function renderUser(state, user) {
  var children = [
      h('span.Presence__User__name', user.name)
    , state.user.id === user.id? h('small', h('em', ' this is you')) : ''
    ]
  , props = {}
  state.events['presence:renderUser'](state, user, props, children)
  return h('li.Presence__User'+(state.user.id === user.id? '.mark':''), props, children)
}
