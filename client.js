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
module.exports.consumes = ['ui', 'editor']
function setup(plugin, imports, register) {
  var ui = imports.ui

  var link = document.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('href', 'static/hive-plugin-presence/css/index.css')
  document.head.appendChild(link)

  ui.page('/:id',
  function loadClient(ctx, next) {
    var container = document.createElement('div')
    container.setAttribute('class', 'Presence')
    document.body.insertBefore(container, document.body.firstChild)

    var broadcast = ctx.broadcast.createDuplexStream(new Buffer('presence'))
      , users = {} // model

    broadcast.pipe(jsonParse()).pipe(through.obj(function(list, enc, cb) {
      // Update model
      users = list

      // Update display
      var newTree = render()
        , patches = vdom.diff(tree, newTree)
      vdom.patch(root, patches)
      tree = newTree
      cb()
    }))

    var root
    var tree = render()
    container.appendChild(root = vdom.create(tree))

    function render() {
      return h('div', [
        h('h5.Presence__Title', [Object.keys(users).length+' Users ', h('small', 'currently viewing this document')]),
        h('ul.Presence__Users.list-unstyled', Object.keys(users).map(function(userId) {
          return renderUser(ctx, users[userId])
        }))
      ])
    }

    next()
  })

  register()
}

function renderUser(ctx, user) {
  return h('li.Presence__User'+(ctx.user.id === user.id? '.mark':''), [
    h('span.Presence__User__name', user.name)
  ])
}


function jsonStringify() {
  return through.obj(function(buf, enc, cb) {
    this.push(JSON.stringify(buf)+'\n')
    cb()
  })
}
