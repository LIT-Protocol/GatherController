import { Game } from "@gathertown/gather-game-client";
import webSocket from "isomorphic-ws";
import { Model } from "objection";
import Knex from "knex";
import knexConfig from "./knexfile.js";
import ConnectedService from "./models/ConnectedService.js";
import GatherLockedSpaces from "./models/GatherLockedSpaces.js";
import GatherPermittedAreas from "./models/GatherPermittedAreas.js";
import fetch from 'node-fetch';

global.WebSocket = webSocket;

// Initialize knex.
const knex = Knex(knexConfig[process.env.NODE_ENV || "development"]);

// Give the knex instance to objection.
Model.knex(knex);

// ======================================================
// +                 General Helpers                    +
// ======================================================
//
// Turn (String) '18,24' into Array [18, 24]
// @param { String } coordinates '18, 24'
// @return { Array } [18, 24]
//
const coordinatesStringToArray = (coordinates) => {
  return (coordinates.replaceAll(' ', '')).split(',').map((coor) => parseInt(coor))
};

//
// Get center coordinates of a restricted area 
// by topLeft and bottomRight
// @param { Object } area | restricted area
// @return { centerX, center Y} int, int
//
const getCenter = (area) => {
  const offsetX = (coordinatesStringToArray(area.bottomRight)[0] - coordinatesStringToArray(area.topLeft)[0]) / 2;
  const offsetY = (coordinatesStringToArray(area.bottomRight)[1] - coordinatesStringToArray(area.topLeft)[1]) / 2;
  const centerX = coordinatesStringToArray(area.topLeft)[0] + offsetX;
  const centerY = coordinatesStringToArray(area.topLeft)[1] + offsetY;

  return { centerX, centerY } 
}

// ======================================================
// +                    CONSTANTS                       +
// ======================================================
const GATHER_API_KEY = process.env.LIT_GATHER_CONTROLLER_GATHER_API_KEY;


// ======================================================
// +                Gather Game States                  +
// ======================================================
//
// eg. 
// {
//   "xxjOqy4UVxYaHzl2LSs6HygNVbZ2": { <-- playerId
//     "balcony": false, <-- if user is allowed to enter this space
//     "roofTop" : false,
//     ..
//   }
// }
const runningInstances = [];
const userRestrictedCoordinatesCache = {};
const lastCoordinates = {};

// ======================================================
// +                  Gather Helper                     +
// ======================================================

//
// (GET) Check if a space exists
// @param { String } spaceId
// @return { Boolean } 
//
const isSpaceExists = async (spaceId) => {
  const data = await fetch('https://api.gather.town/api/getRoomInfo?room=' + spaceId);
  return data.status == 200;
}

//
// Initialise an empty object using playerId as key
// @param { String } playerId
// @return { void } 
//
const initUserRestrictedCoordinatesCache = (playerId) => {
  console.log(`🔥 initUserRestrictedCoordinatesCache: ${playerId}`)

  if( ! userRestrictedCoordinatesCache[playerId] ){
    userRestrictedCoordinatesCache[playerId] = {}
  }
  console.log(`👉 userRestrictedCoordinatesCache:`, userRestrictedCoordinatesCache)
}

// 
// Deny access to all restricted areas
// @param { Array } restricted spaces
// @param { String } playerId
// @return { void } 
//
const denyAllAccess = (areas, playerId) => {
  console.log(`❌ denyAllAccess: ${areas} ${playerId}`)
  areas.forEach((area) => {
    userRestrictedCoordinatesCache[playerId][area.name] = false;
  })
}

// ======================================================
// +                  Gather Setter                     +
// ======================================================

//
// Warp user if not permitted to the restircted area
// @param { String } spaceId
// @param { int } x
// @param { int } y
// @param { context } Object
// @param { Game } game
// @return { void }
//
const warpIfDeniedAccess = async (spaceId, x, y, context, game) => {

  // -- prepare
  const playerId = context.playerId;
  const playerMap = context.player.map;

  const restrictedAreasResult = await GatherLockedSpaces.query().where({space_id: spaceId});

  // -- validate
  if( restrictedAreasResult.length <= 0 ){
    // console.log(`❌ warpIfDeniedAccess: Nothing to be set here`);
    return;
  }

  const restrictedSpaceInfo = JSON.parse((restrictedAreasResult)[0].restricted_spaces);
  
  // console.log("👉 restrictedSpaceInfo:", restrictedSpaceInfo);

  restrictedSpaceInfo.forEach((space) => {
    
    // -- prepare
    const spaceName = space.name;
    const wallThickness = parseInt(space.wallThickness);
    const topLeft = coordinatesStringToArray(space.topLeft);
    const bottomRight = coordinatesStringToArray(space.bottomRight);

    const isInside = (
      x >= topLeft[0] - wallThickness &&
      x <= bottomRight[0] + wallThickness && 
      y >= topLeft[1] - wallThickness && 
      y <= bottomRight[1] + wallThickness
    );
    
    const isAllowed = userRestrictedCoordinatesCache[playerId][spaceName];

    // -- validate:: do nothing if it's outside
    if( ! isInside ){ return }

    // -- validate:: if user is not allowed, teleport user
    if( ! isAllowed){
      console.log("❌ NOT ALLOWED!");

      game.teleport(
        playerMap,
        lastCoordinates[playerId][0].x,
        lastCoordinates[playerId][0].y,
        playerId
      )

      const requiredCondition = space.humanised;
      const msg = `❌ denied access to ${space.name}, must \n${requiredCondition}`;

      game.chat(playerId, [playerId], playerMap, msg)
    }

  });
}

// 
// Set restricted spaces when user joins 
// based on its token holdings when it joins the space
// @param { String } spaceId
// @param { String } playerId
// @return { void }
//
const setRestrictedSpaces = async (spaceId, playerId) => {
  console.log("🔥 setRestrictedSpaces")

  // -- cache
  // Initialise a cache for this playerId if it hasn't done so
  initUserRestrictedCoordinatesCache(playerId);

  // -- prepare:: connected user
  const connectedService = await ConnectedService.query().where({id_on_service: playerId, service_name: "gather",});
  console.log("👉 connectedService:", connectedService.length > 0);

  // -- prepare:: restricted coordinates for this space 
  const restrictedAreasResult = await GatherLockedSpaces.query().where({space_id: spaceId});

  // -- validate
  if( restrictedAreasResult.length <= 0 ){
    console.log(`❌ setRestrictedSpaces: Nothing to be set here`);
    return;
  }
  
  const restrictedAreas = JSON.parse(restrictedAreasResult[0].restricted_spaces).map((e) => e.name);
  console.log(`👉 restrictedAreas:`)
  console.log(restrictedAreas)

  // -- validate
  if( connectedService.length <= 0 ){
    console.log(`❌ Player "${playerId}"'s wallet not registered. Denied all access.`)
    denyAllAccess(restrictedAreas, playerId);
    return;
  }

  // -- prepare
  const playerWalletAddress = connectedService[0].wallet_address;
  console.log(`👉 playerWalletAddress: ${playerWalletAddress}`)

  // -- prepare:: permitted areas
  const permittedAreasResult = await GatherPermittedAreas.query().where({wallet_address: playerWalletAddress});

  // -- validate
  if( permittedAreasResult.length <= 0){
    denyAllAccess(restrictedAreas, playerId);
    return;
  }
  
  const permittedAreas = JSON.parse((permittedAreasResult)[0].permitted_areas);

  console.log("👉 permittedAreas:", permittedAreas);

  // -- check through all areas in the space
  console.log('------------------------------');
  restrictedAreas.forEach((area) =>{
    if( ! permittedAreas.includes(area)){
      console.log(`❌ ${area} is NOT permitted.`);
      userRestrictedCoordinatesCache[playerId][area] = false;
      return;
    }
    console.log(`✅ ${area} is permitted.`);
    userRestrictedCoordinatesCache[playerId][area] = true;
  })
  console.log('------------------------------');

  console.log("👉 userRestrictedCoordinatesCache:", userRestrictedCoordinatesCache);

}

// ======================================================
// +                    DB Helper                       +
// ======================================================

//
// Get the X, Y cooridnates of the initial position
// @param { Int } spaceId
// @return {x, y}
//
const getInitialCoordinates = async (spaceId) => {
  console.log("🔥 getInitialCoordinates")

  let coordinates = (await GatherLockedSpaces.query().where({space_id: spaceId}))[0]?.initial_coordinates || '31,32';

  console.log(`👉 coordinates: ${coordinates}`);
  coordinates = coordinates.split(',').map((coor) => parseInt(coor))
  const x = coordinates[0];
  const y = coordinates[1];
  return { x, y };
}

//
// Get all spaces is
// @return { Array } ids
//
const getAllSpacesId = async () => {
  console.log("🔥 getAllSpacesId")
  const GatherModel = await GatherLockedSpaces.query();
  const ids = GatherModel.map((e) => e.space_id);
  return ids
}

// ======================================================
// +               Chat Commands Handlers               +
// ======================================================

//
// Teleport user using the following commands:
// NOTE: Must be in "Everyone" channel
// COMMAND: /teleport {name} me <-- to sender's coordinates
// COMMAND: /teleport {name(case-sensitive)} {coordinates} <-- to a specific coordinates
// COMMANDS: /teleport {name} {area} <-- to a specific named area eg. balcony
// @param { String } senderId
// @param { Array } commands
// @param { Game } game
// @param { Context } context
// @param { String } spaceId
// @return { void }
//
const chatCommandTeleport = async (senderId, commands, game, context, spaceId) => {
  const targetPlayerName = commands[1];
  const teleportLocation = commands[2];

  // -- validate
  if(targetPlayerName == undefined || teleportLocation == undefined) return;

  // -- prepare
  const targetPlayerInfo = Object.values(game.players).map((player, i) => {
    player.id = Object.keys(game.players)[i];
    return player;
  }).find((player) => player.name == targetPlayerName);

  // -- validate
  if( ! targetPlayerInfo ){
    game.chat(senderId, [senderId], context.player.map, `❌ ${targetPlayerName} doesn't exist`);
    return;
  }
  // console.log(targetPlayerInfo.id);
  
  const senderInfo =  Object.values(game.players).map((player, i) => {
    player.id = Object.keys(game.players)[i];
    return player;
  }).find((player) => player.id == senderId);
  
  // console.log(senderInfo);

  // -- (option) to sender's location
  if(teleportLocation == 'me'){
    game.teleport(
      context.player.map,
      senderInfo.x,
      senderInfo.y,
      targetPlayerInfo.id
    )
    return;
  }
  
  // -- (option) to specific coordinates
  if(teleportLocation.includes(',')){
    console.log("❗❗ to specific coordinates");
    
    const coordinates = teleportLocation.split(',');

    const x = parseInt(coordinates[0]);
    const y= parseInt(coordinates[1]);
    
    // -- validate is valid coordinates
    if( ! x || ! y ){
      game.chat(senderId, [senderId], context.player.map, "❌ Invalid coordinates");
      return;
    }

    console.log(`${senderId} sending ${targetPlayerName} to ${x}, ${y}`);
    
    // -- teleport
    game.teleport(
      context.player.map,
      x,
      y,
      targetPlayerInfo.id
    )
    return;
  }

  // -- (option) to a specifc named-area
  const restrictedAreasResult = await GatherLockedSpaces.query().where({space_id: spaceId});

  // -- validate
  if( restrictedAreasResult.length <= 0 ){
    game.chat(senderId, [senderId], context.player.map, "❌ No restricted areas in this space.");
    return;
  }

  const restrictedSpaceInfo = JSON.parse((restrictedAreasResult)[0].restricted_spaces);
  
  var targetArea = restrictedSpaceInfo.filter((area) => area.name == teleportLocation);
  
  // -- if starts with double
  if(teleportLocation[0] == '"'){
    console.log("❗❗ if starts with double");

    var name = (commands.join(' ')).split('"')[1];

    const area = restrictedSpaceInfo.filter((area) => area.name == name)[0];
    
    // -- validate
    if( ! area ){
      game.chat(senderId, [senderId], context.player.map, `❌ ${name} does not exist.`);
      return;
    }

    var { centerX, centerY } = getCenter(area);

    game.teleport(
      context.player.map,
      centerX,
      centerY,
      targetPlayerInfo.id
    )
    return;
  }
  

  // -- validate
  if( targetArea.length <= 0){
    game.chat(senderId, [senderId], context.player.map, `❌ ${teleportLocation} does not exist.`);
    return;
  }

  console.log("❗❗ last resort");

  const area = restrictedSpaceInfo.filter((area) => area.name == teleportLocation)[0];
  var { centerX, centerY } = getCenter(area);

  // -- teleport
  game.teleport(
    context.player.map,
    centerX,
    centerY,
    targetPlayerInfo.id
  )

  return;

}

//
// List all the restricted areas of this space
// COMMAND: /list
// @param { String } senderId
// @param { Array } commands
// @param { Game } game
// @param { Context } context
// @param { String } spaceId
// @return { void }
//
const chatCommandsList = async (senderId, commands, game, context, spaceId) => {
  const restrictedAreasResult = await GatherLockedSpaces.query().where({space_id: spaceId});

  // -- validate
  if( restrictedAreasResult.length <= 0 ){
    game.chat(senderId, [senderId], context.player.map, "No restricted areas in this space.");
    return;
  }
  
  const restrictedSpaceInfo = JSON.parse((restrictedAreasResult)[0].restricted_spaces);
  
  const restrictedAreas = restrictedSpaceInfo.map((area, i) => {

    const { centerX, centerY } = getCenter(area);

    return `${i + 1}: "${area.name}" : (${centerX},${centerY})`;
  }).join('\n');

  console.log(restrictedAreas);
  game.chat(senderId, [senderId], context.player.map, restrictedAreas);

}

// ======================================================
// +                  Gather Handlers                   +
// ======================================================

//
// Cache & record user last steps
// @param { String } playerId
// @param { int } x
// @param { int } y
// @return { void }
//
const recordLastSteps = (playerId, x, y) =>{
  if( ! lastCoordinates[playerId] ){
    lastCoordinates[playerId] = []
  }
  lastCoordinates[playerId].push({x, y});
  
  if(lastCoordinates[playerId].length > 2){
    lastCoordinates[playerId].shift();
  }
}

//
// Handler:: Check if connection is subscribed
// @param { Boolean } connected
// @return { void }
//
const handleConnectionSubscription = (connected) => {
  console.log("🔥 handleConnectionSubscription")
  console.log(`✅ Connected: ${connected}`)
}

//
// Handler:: When user joins the space
// @param { Object } data
// @param { Object } context
// @param { Game } game
// @param { String } spaceId
// @return { void }
//
const handlePlayerJoins = async (data, context, game, spaceId) => {
  console.log(`🔥 handlePlayerJoins: ${spaceId}`)

  // -- prepare
  const playerId = context.playerId;
  const playerMap = context.player.map;
  const {x, y} = await getInitialCoordinates(spaceId);

  console.log(`👉 playerId: ${playerId}`);
  console.log(`👉 playerMap: ${playerMap}`);
  console.log(`👉 initialCoordinates: ${x}, ${y}`)

  // -- set user default location
  game.teleport(playerMap, x, y, playerId);

  // -- set user restricted areas
  await setRestrictedSpaces(spaceId, playerId)
}

//
// Handler:: When a player moves
// @param { Object } data
// @param { Object } context
// @param { Game } game
// @param { String } spaceId
// @return { void } 
//
const handlePlayerMoves = async (data, context, game, spaceId) => {
  
  // -- prepare
  const playerId = context.playerId;
  const player = context?.player?.name ?? playerId;
  const x = data.playerMoves.x;
  const y = data.playerMoves.y;

  console.log(`🔥 handlePlayerMoves(${spaceId}): ${player} moves to ${x},${y}`)

  // -- check if user cache is set
  if( ! userRestrictedCoordinatesCache[playerId] ){
    await setRestrictedSpaces(spaceId, playerId);
  }

  // -- cache user's last positions
  recordLastSteps(playerId, x, y);
  
  // -- check if user enters restircted areas
  warpIfDeniedAccess(spaceId, x, y, context, game)

}

//
// Handler:: Listen to chat
// @param { Object } data
// @param { Object } context
// @param { Game } game
// @param { String } spaceId
// @return { void } 
//
const handlePlayerChat = async (data, context, game, spaceId) => {

  // -- prepare
  const senderId = data.playerChats.senderId;
  const msg = data.playerChats.contents;

  console.log(msg);

  // -- check if it's space creator sending the message
  const connectedService = await ConnectedService.query().where({service_name: 'gather', id_on_service: senderId});

  console.log("senderId:", senderId);

  console.log("connectedService22:", connectedService);

  // -- validate: sender connected to service
  if(connectedService.length <= 0){
    console.log(`❌ ${senderId} not connected to his/her wallet.`);
    return;
  }
  
  const playerWalletAddress = connectedService[0]?.wallet_address;
  
  const isCreator = (await GatherLockedSpaces.query().where({space_id: spaceId, wallet_address: playerWalletAddress})).length > 0;

  if(isCreator){
    console.log(`👑 [${spaceId}:${senderId}] says: ${msg}`);

    // -- check commands
    const commands = msg.split(' ');
    const action = commands[0];
    
    // -- handle teleport command
    if( action == '/teleport'){
      chatCommandTeleport(senderId, commands, game, context, spaceId);
    }

    if( action == '/list'){
      chatCommandsList(senderId, commands, game, context, spaceId);
    }
  }
}

//
// Initialise game instance
// @param { String } spaceId
// @return { void } 
//
const initGameInstance = async (spaceId) => {
  console.log(`🔥 initGameInstance: ${spaceId}`)

  // -- validate: if space exists
  const spaceExists = await isSpaceExists(spaceId);
  if( ! spaceExists ){
    console.log(`❌ ${spaceId} does not exist.`)
    return;
  }

  console.log(`✅ ${spaceId} exists.`)
  runningInstances.push(spaceId)

  // ------------------------------------------------------
  // +             Initalise Gather Web Socket            +
  // ------------------------------------------------------
  const game = new Game(() => Promise.resolve({ apiKey: GATHER_API_KEY }));
  game.connect(spaceId);
  
  // ------------------------------------------------------
  // +         Event:: Listen when player connects        +
  // ------------------------------------------------------
  game.subscribeToConnection(handleConnectionSubscription);
  
  // ------------------------------------------------------
  // +          Event:: Listen when player joins          +
  // ------------------------------------------------------
  game.subscribeToEvent("playerJoins", (data, context) => handlePlayerJoins(data, context, game, spaceId));
  
  // ------------------------------------------------------
  // +          Event:: Listen when player moves          +
  // ------------------------------------------------------
  game.subscribeToEvent("playerMoves", (data, context) => handlePlayerMoves(data, context, game, spaceId));

  // ------------------------------------------------------
  // +               Event:: Listen to chat               +
  // ------------------------------------------------------
  game.subscribeToEvent("playerChats", (data, context) => handlePlayerChat(data, context, game, spaceId))

}

// ========================================================================================
// +                                LOOP THROUGH ALL SPACES                               +
// +                                ---–––––---------------                               +
// + https://gathertown.notion.site/Gather-Websocket-API-bf2d5d4526db412590c3579c36141063 +
// ========================================================================================

const DEBUG = false;

if(DEBUG){
  // initGameInstance("tXVe5OYt6nHS9Ey5/lit-protocol")
  initGameInstance("4Tq4fQkpxC2Tfci1/Monkey Kingdom")
}else{
  let ALL_SPACES = await getAllSpacesId();
  
  ALL_SPACES.forEach((spaceId) => {
    initGameInstance(spaceId);
  })
}


// ========================================================================================
// +                  Check every minute if there are newly created spaces                +
// +                                ---–––––---------------                               +
// ========================================================================================
setInterval(async () => {
  
  let spacesId = await getAllSpacesId()

  // console.log("👉 spacesId:", JSON.stringify(spacesId))
  // console.log("👉 runningInstances:", JSON.stringify(runningInstances))

  let logged = false;

  spacesId.forEach((spaceId, i) => {

    // -- ignore spaces that are already running
    if(runningInstances.includes(spaceId)){
      if( ! logged ){
        console.log(`[${Date.now()}] 💤 Nothing new here.. still running the same-old instances.`);
        logged = true;
      }
      return;
    }

    // -- initialise spaces that aren't running
    console.log("🚀 Launch: ", spaceId);

    initGameInstance(spaceId)
  });


}, 60000);