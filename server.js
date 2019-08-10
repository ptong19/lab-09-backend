/* eslint-disable indent */
'use strict';

//======================== Globla Variables and appplication dependensies ================================//

// these are our application dependencies
const express = require('express');
const app = express();

//add cors and superagent
const cors = require('cors');
app.use(cors());
const superagent = require('superagent');

// configure environment variables
require('dotenv').config();
const PORT = process.env.PORT || 3000;

const pg = require('pg');

//connection to the client
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));


// tell our express server to start listening on port PORT
app.listen(PORT, () => console.log(`listening on port ${PORT}`));

//variable to store our city/location object
let city; 
//=======================================================================================================//

app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/events', getEvents);

//============================== Location Feature ==========================================================//

//route to handle user request and send the response from our database or GOOGLE
function getLocation(req,res){

  //check if this lcoation exist in database
  lookupLocation(req.query.data)
    .then(location => {

      if (location){
        //if exists send the object as response
        res.send(location);
      }

      //if doesn't exists go to go to google api
      else
      {//req.query.data gives us actual string value of users input
        searchToLatLong(req.query.data)

        //when we got a return from searchLatLong then this return will be used to send as the response
          .then(location =>{

            res.send(location);

          });
      }
    });
}

//check if data from SQL DB contains requested location
let lookupLocation = (location) =>{
  let SQL = 'SELECT * FROM locations WHERE search_query=$1';
  let values = [location];
  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0){
        // if so return location data
        return result.rows[0];
      }
    });
};

//function to search for the location latitude and longitude using geocode api key
function searchToLatLong(query){
  const url =`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  //using our superagent library to get the proper data format
  return superagent.get(url)

  //then when we got the data from superagent create a new City object with the query (location name) and data (res.body.results[0]);
    .then(res => {
      city = new City(query, res.body.results[0]);
      ////envoking prototype function to set our object in table
      city.postLocation(query);
      return city;
    });

}

// constructor function to buld a city object instances, paths based on the geo.json file
function City(query, data){
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
  this.id; 

}

///prototype function to City constructor function to post NEW data in database

City.prototype.postLocation = function (){

  let SQL = 'INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id';
  const values = [this.search_query, this.formatted_query, this.latitude, this.longitude];

  return client.query(SQL, values)
    .then (result => {
      this.id = result.rows[0].id;
    });

};

//=============================================================================================================//


//============================== Weather feature =================================================================//

//route to handle user request and send the response from our database or DarkSky
function getWeather(req, res){
  
  //check if this lcoation exist in database
  lookupWeather(req.query.data)
    .then(location => {

      if (location){
        //if exists send the object as response
        res.send(location);
      }

      //if doesn't exists go to go to google api
      else
      {//req.query.data gives us actual string value of users input
        searchWeatherDarksky(req, res)

        //when we got a return from searchLatLong then this return will be used to send as the response
          .then(location =>{

            res.send(location);

          });
      }
    });
}
function searchWeatherDarksky (req, res){
  const api_url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
  return superagent.get(api_url)

    .then(weatherDisplay => {
      // let weatherSummaries = [];   ///array to store our days weather summaries
      let weatherSummaries = weatherDisplay.body.daily.data.map((day) => {
        return new Weather(day);  //create new Weather object and push it to weather Summaries
      });
      
      weatherSummaries.forEach((day)=>{
        cacheWeather(day, city.id);
      });
      
      res.send(weatherSummaries); //send WeatherSummaries array as a response
    });
}


function cacheWeather(day, id){
  let SQL = 'INSERT INTO weather (forecast, time, location_id) VALUES ($1, $2, $3)';
  const values = [day.forecast, day.time, id];

  return client.query(SQL, values)
    .then (result => console.log(`weather location id ${id} and result ${result} inserted `));

}

//weather constructor build based on the darksky.json file paths
function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15); //converting UNix timestamp to regular time
}

//check if data from weaether SQL DB contains requested location
let lookupWeather = (location) =>{
  let SQL = 'SELECT * FROM weather WHERE location_id=$1';
  let values = [location.id];
  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0){
        // if so return location data
        return result.rows;

      }
    });
};

//=============================================================================================================//


//==================================EVENTBRITE feature===========================================================================//
// route to handle user request and send the response from our database or EVENTBRITE
function getEvents(req, res){
  lookupEvents(req.query.data)
    .then(location => {

      if (location){
        //if exists send the object as response
        res.send(location);
        console.log ("events db data used");
      }

      //if doesn't exists go to go to Eventbrite api
      else
      {//req.query.data gives us
        searchEventsEventbrite(req, res)
           .then(location =>{
             console.log('EVEtbrite DATA used');
             res.send(location);
             

        });
      }
    });
}

//check if data from events SQL DB contains requested location
let lookupEvents = (location) =>{
  let SQL = 'SELECT * FROM events WHERE location_id=$1';
  let values = [location.id];
  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0){
        // if so return location data
        return result.rows;

      }
    });
};

function searchEventsEventbrite(req, res){
  const api_url = `https://www.eventbriteapi.com/v3/events/search?token=${process.env.EVENTBRITE_API_KEY}&location.address=${req.query.data.search_query}`;
  
  return superagent.get(api_url)

    .then(result => {
      
      let eventSummaries = result.body.events.map((event) => {
       return new Event(event);  //create new Event object and push it to Event Summaries
       
      });
      
      eventSummaries.forEach((event) => {
        cacheEvents(event, city.id);
       
      });

      res.send(eventSummaries); //send Eventbrite summaries array as a response
    });

}

function cacheEvents(event, id){
  let SQL = 'INSERT INTO events (link, name, event_date, summary, location_id) VALUES ($1, $2, $3, $4, $5)';
  const values = [event.link, event.name, event.event_date, event.summary, id];

  return client.query(SQL, values)
    .then (result => console.log(`events location id ${id} and result ${result} inserted `));

}

function Event(data){
  this.link = data.url;
  this.name = data.name.text;
  this.event_date = new Date(data.start.local).toString().slice(0, 15);
  this.summary = data.summary;
}


//=============================================================================================================//




