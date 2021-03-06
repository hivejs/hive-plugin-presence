/** 
 * hive.js 
 * Copyright (C) 2013-2016 Marcel Klehr <mklehr@gmx.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License version 2
 * as published by the Mozilla Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the Mozilla Public License
 * along with this program.  If not, see <https://www.mozilla.org/en-US/MPL/2.0/>.
 */
var path = require('path')
  , co = require('co')
  , through = require('through2')
  , JSONParse = require('json-stream')

module.exports = setup
module.exports.consumes = ['ui', 'broadcast', 'auth', 'ui']

function setup(plugin, imports, register) {
  var ui = imports.ui
    , broadcast = imports.broadcast
    , auth = imports.auth

  ui.registerModule(path.join(__dirname, 'client.js'))
  ui.registerStylesheet(path.join(__dirname, 'css/index.css'))
  ui.registerLocaleDir(path.join(__dirname, 'locales'))

  var users = {}

  broadcast.registerChannel(new Buffer('presence'), function(user, docId, clientStream, broadcastStream) {
    // update local list
    if(!users[docId]) users[docId] = {}
    if(users[docId][user.id]) users[docId][user.id]++
    else users[docId][user.id] = 1

    var broadcasting = JSONStringify()
    broadcasting.pipe(broadcastStream)

    var thisClient = JSONStringify()
    thisClient.pipe(clientStream)
 
    // Send a patch to everyone
    broadcasting.write({[user.id]: users[docId][user.id]})

    // Send the current list to this client
    thisClient.write(users[docId])

    // Notify the others if this client disconnects
    clientStream.on('close', function() {
      users[docId][user.id]--
      broadcasting.write({[user.id]: users[docId][user.id]})
    })

    // Throw away incoming messages
    clientStream.pipe(through.obj(function(buf, enc, cb){
      cb()
    }))

    // Athorize presence:read
    broadcastStream.pipe(JSONParse()).pipe(through.obj(function(patch, enc, cb) {
      var that = this
      co(function*() {
        var authorized = yield auth.authorize(user, 'document/presence:read', {document: docId})
        if(!authorized) return
        for(var userId in patch) {
          users[docId][userId] = patch[userId]
          if(!users[docId][userId]) delete users[docId][userId]
        }
        that.push(users[docId])
      }).then(cb).catch(cb)
    })).pipe(thisClient)
  })

  register()
}


function JSONStringify() {
  return through.obj(function(buf, enc, cb) {
    this.push(JSON.stringify(buf)+'\n')
    cb()
  })
}
