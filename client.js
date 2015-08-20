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
  , co = require('co')
  , vdom = require('virtual-dom')
  , h = vdom.h

module.exports = setup
module.exports.consumes = ['ui', 'editor', 'models', 'hooks']
function setup(plugin, imports, register) {
  var ui = imports.ui
    , hooks = imports.hooks
    , Backbone = imports.models.Backbone

  var link = document.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('href', 'static/hive-plugin-presence/css/index.css')
  document.head.appendChild(link)

  ui.page('/:id', function(ctx, next) {
    var broadcast = ctx.broadcast.createDuplexStream(new Buffer('presence'))
      , users = new (Backbone.Collection.extend({model: ctx.models.user}))()

    broadcast.pipe(jsonParse()).pipe(through.obj(function(list, enc, cb) {
      // Update models
      users.set(Object.keys(list).map(function(userId) {
        if(userId == ctx.user.get('id')) return ctx.user
        return list[userId]
      }))
      cb()
    }))

    var tree, root
    co(function*() {
      tree = yield render()
      root = vdom.create(tree)
      document.body.insertBefore(root, document.body.firstChild)
    }).then(function(){})

    users.on('add remove change', function() {
      co(function*() {
        // Update display
        var newTree = yield render()
          , patches = vdom.diff(tree, newTree)
        vdom.patch(root, patches)
        tree = newTree
      }).then(function(){})
    })
    users.on('add', function(user) {
      setInterval(function() {
        user.fetch()
      }, 10000)
    })

    function* render() {
      return h('div.Presence', [
        h('h5.Presence__Title', [users.length+' Users ', h('small', 'currently viewing this document')]),
        h('ul.Presence__Users.list-unstyled', yield users.map(function*(userId) {
          return yield renderUser(users.get(userId))
        }))
      ])
    }

    function* renderUser(user) {
      var children = [
          h('span.Presence__User__name', user.get('name'))
        , ctx.user.get('id') === user.get('id')? h('small', h('em', ' this is you')) : ''
        ]
      , props = {}
      yield hooks.callHook('plugin-presence:renderUser', user, props, children)
      return h('li.Presence__User'+(ctx.user.get('id') === user.get('id')? '.mark':''), children)
    }

    next()
  })

  register()
}


function jsonStringify() {
  return through.obj(function(buf, enc, cb) {
    this.push(JSON.stringify(buf)+'\n')
    cb()
  })
}
