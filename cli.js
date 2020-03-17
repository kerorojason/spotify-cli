#!/usr/bin/env node
// const [, , ...args] = process.argv;
// console.log(`Hello, here is my first CLI tool! ${args}`);
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const keytar = require('keytar');
const opn = require('opn');
const meow = require('meow');
const inquirer = require('inquirer');

const cli = meow(
  `
    Usage
      $ spotify commands [--options] [argument]

    Command
      login            open your default browser and show authentication page
      next             play next track
      search           search playlist / artist / track


    Options
      -p, --playlist   Search by playlist
      -a, --artist     Search by artist
      -t, --track      Search by track

    Examples
      $ spotify search -p lofi
    > lofi hip hop music... 
      Lo-Fi Beats
      Lofi Jazz 
`,
  {
    flags: {
      playlist: { tyoe: 'boolean', alias: 'p' },
      track: { tyoe: 'track', alias: 't' },
      artist: { tyoe: 'artist', alias: 'a' }
    }
  }
);

async function main(action, flags) {
  if (action === 'login') {
    const app = express();
    app.use(cors());
    app.use(bodyParser.json());
    app.post('/login', (req, res) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      const { accessToken, refreshToken } = req.body;
      // console.log(accessToken, refreshToken);
      keytar.setPassword('spotify', 'accessToken', accessToken);
      keytar.setPassword('spotify', 'refreshToken', refreshToken);
      setTimeout(function() {
        server.close();
      }, 2000);
    });
    const server = app.listen(8080);
    // opn('http://localhost:5000/auth/spotify');
    opn('http://spotify-cli-server.herokuapp.com/auth/spotify');
  }

  if (action === 'next') {
    const accessToken = await keytar.getPassword('spotify', 'accessToken');
    try {
      await axios({
        method: 'post',
        url: 'https://api.spotify.com/v1/me/player/next',
        headers: {
          Authorization: 'Bearer ' + accessToken
        }
      });
    } catch (err) {
      if (err.response.status === 401) {
        await refresh();
        await main(action, flags);
      }
    }
  }

  if (action === 'prev') {
    const accessToken = await keytar.getPassword('spotify', 'accessToken');
    try {
      await axios({
        method: 'post',
        url: 'https://api.spotify.com/v1/me/player/previous',
        headers: {
          Authorization: 'Bearer ' + accessToken
        }
      });
    } catch (err) {
      if (err.response.status === 401) {
        await refresh();
        await main(action, flags);
      }
    }
  }

  if (action === 'search') {
    try {
      const accessToken = await keytar.getPassword('spotify', 'accessToken');
      const type = ['playlist', 'song', 'artist'].find(item => flags[item]);
      switch (type) {
        case 'playlist':
          {
            // query playlists
            const res = await axios({
              method: 'get',
              url: `https://api.spotify.com/v1/search?q=${flags[type]}&type=playlist`,
              headers: {
                Authorization: 'Bearer ' + accessToken
              },
              params: {
                limit: 5
              }
            });

            // interactive list
            inquirer
              .prompt({
                type: 'list',
                name: 'playlistId',
                message: 'Which playlist do you want to play?',
                choices: res.data.playlists.items.map(item => ({
                  name: item.name,
                  value: item.id
                }))
              })
              .then(answer => {
                play('playlists', answer.playlistId);
              })
              .catch(error => {
                console.log(error);
              });
          }
          break;
        case 'artist':
          {
            // query artists
            const res = await axios({
              method: 'get',
              url: `https://api.spotify.com/v1/search?q=${flags[type]}&type=artist`,
              headers: {
                Authorization: 'Bearer ' + accessToken
              },
              params: {
                limit: 5
              }
            });

            // interactive list
            inquirer
              .prompt({
                type: 'list',
                name: 'artistId',
                message: 'Which playlist do you want to play?',
                choices: res.data.artists.items.map(item => ({
                  name: item.name,
                  value: item.id
                }))
              })
              .then(answer => {
                play('artists', answer.artistId);
              })
              .catch(error => {
                console.log(error);
              });
          }
          break;
      }
    } catch (err) {
      if (err.response.status === 401) {
        await refresh();
        await main(action, flags);
      }
    }
  }

  if (action === 'refresh') {
    const refreshToken = await keytar.getPassword('spotify', 'refreshToken');
    const res = await axios({
      method: 'post',
      url: 'http://spotify-cli-server.herokuapp.com/api/refresh_token',
      data: {
        refreshToken: refreshToken
      }
    });
    await keytar.setPassword('spotify', 'accessToken', res.data);
  }
}

main(cli.input[0], cli.flags);

async function play(type, id) {
  const accessToken = await keytar.getPassword('spotify', 'accessToken');
  let uris;
  switch (type) {
    case 'playlists':
      {
        let res = await axios({
          method: 'get',
          url: `https://api.spotify.com/v1/${type}/${id}/tracks`,
          headers: {
            Authorization: 'Bearer ' + accessToken
          },
          params: { fields: 'items(track(name, artists, id))' }
        });
        uris = res.data.items.map(item => 'spotify:track:' + item.track.id);
      }
      break;
    case 'artists':
      {
        let res = await axios({
          method: 'get',
          url: `https://api.spotify.com/v1/artists/${id}/top-tracks?country=SE`,
          headers: {
            Authorization: 'Bearer ' + accessToken
          }
        });
        uris = res.data.tracks.map(track => 'spotify:track:' + track.id);
      }
      break;
  }

  // start playing playlist
  await axios({
    method: 'put',
    url: 'https://api.spotify.com/v1/me/player/play',
    headers: {
      Authorization: 'Bearer ' + accessToken
    },
    data: {
      uris: uris
    }
  });
}

async function refresh() {
  const refreshToken = await keytar.getPassword('spotify', 'refreshToken');
  const res = await axios({
    method: 'post',
    url: 'https://spotify-cli-server.herokuapp.com/api/refresh_token',
    data: {
      refreshToken: refreshToken
    }
  });
  await keytar.setPassword('spotify', 'accessToken', res.data);
}
