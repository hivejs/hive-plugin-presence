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
  , AtomicEmitter = require('atomic-emitter')

module.exports = setup
module.exports.consumes = ['ui', 'editor', 'api']
module.exports.provides = ['presence'] // used by cursor broadcast plugin
function setup(plugin, imports, register) {
  var ui = imports.ui
    , editor = imports.editor
    , api = imports.api

  ui.reduxReducerMap.presence = reducer
  function reducer(state, action) {
    if(!state) {
      return {
        active: false
      , users: {}
      }
    }
    if('PRESENCE_ACTIVATE' === action.type) {
      return {...state, active: true}
    }
    if('PRESENCE_LOAD_USER' === action.type) {
      return {...state, users: {...state.users, [action.payload.id]: action.payload}}
    }
    return state
  }

  var presence = {
    action_activate: function() {
      return {type: 'PRESENCE_ACTIVATE'}
    }
  , action_loadUser: function*(userId) {
      var user = yield api.action_user_get(userId)
      return yield {type: 'PRESENCE_LOAD_USER', payload: user}
    }
  , onRenderUser: AtomicEmitter()
  }

  editor.onLoad((editableDoc, broadcast, onClose) => {
    ui.store.dispatch(presence.action_activate())

    ui.store.dispatch({type: 'PRESENCE_LOAD_USER'
    , payload: ui.store.getState().session.user})

    presence.stream = broadcast.createDuplexStream(new Buffer('presence'))

    presence.stream
    .pipe(jsonParse())
    .pipe(through.obj(function(list, enc, cb) {
      // Update models
      Object.keys(list).forEach(function(userId) {
        if(ui.store.getState().presence.users[userId]) return
        ui.store.dispatch(presence.action_loadUser(userId))
      })
      cb()
    }))

    // fetch users regularly
    var interval = setInterval(function() {
      Object.keys(ui.store.getState().presence.users)
      .forEach(function(userId) {
        ui.store.dispatch(presence.action_loadUser(userId))
      })
    }, 10000)

    onClose(_=> {
      clearInterval(interval)
      presence.stream = null
    })
  })

  ui.onRenderBody((store, children) => {
    if(store.getState().presence.active) children.unshift(render(store))
  })

  function render(store) {
    var state = store.getState().presence
    return h('div.Presence', [
      h('h5.Presence__Title', [
        Object.keys(state.users).length+' Users '
        , h('small', 'currently viewing this document')
      ])
    , h('ul.Presence__Users.list-unstyled'
      , Object.keys(state.users).map(function(userId) {
        return renderUser(store, state.users[userId])
      }))
    ])
  }

  function renderUser(store, user) {
    var state = store.getState()
    var children = [
        h('span.Presence__User__name', user.name)
      , state.session.user.id === user.id? h('small', h('em', ' this is you')) : ''
      ]
    , props = {}
    presence.onRenderUser.emit(store, user, props, children)
    return h('li.Presence__User'+(state.session.user.id === user.id? '.mark':'')
    , props
    , children
    )
  }

  register(null, {presence})
}
