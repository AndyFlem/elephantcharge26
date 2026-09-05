const config = {
    port: 4001,
    cors_origin: 'http://localhost:4000',
    development_mode: true,
    api_version: 'v1',
    local_crs: 3857,
    db:{
      database: 'charge23',
      user: 'elephant_charge',
      password: 'extramild20'
    },
    teltonika:{
      database: 'teltonika',
      user: 'postgres',
      password: 'extramild20'
    },
    geotab:{
      server: '172.27.208.1', //For SQL on Win Host and this app on WSL, this is the WSL address given by: ip route show | grep -i default | awk '{ print $3}'
      authentication: {
        type: 'default',
        options: {
          userName: 'sa',
          password: 'extramild20'
        }
      },
      options: {
        encrypt: false,
        database: 'GEOTAB_2023'
      }
    }
}

module.exports = config