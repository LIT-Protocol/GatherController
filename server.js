import { Game } from "@gathertown/gather-game-client";
import webSocket from "isomorphic-ws";
import { Model } from "objection";
import Knex from "knex";
import knexConfig from "./knexfile.js";
import ConnectedService from "./models/ConnectedService.js";
import GatherLockedSpaces from "./models/GatherLockedSpaces.js";
import GatherPermittedAreas from "./models/GatherPermittedAreas.js";

global.WebSocket = webSocket;

// Initialize knex.
const knex = Knex(knexConfig[process.env.NODE_ENV || "development"]);

// Give the knex instance to objection.
Model.knex(knex);

// -- Helper
//
// Turn (String) '18,24' into Array [18, 24]
// @param { String } coordinates '18, 24'
// @return { Array } [18, 24]
//
const coordinatesStringToArray = (coordinates) => {
  return (coordinates.replaceAll(' ', '')).split(',').map((coor) => parseInt(coor))
};

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
  const restrictedSpaceInfo = JSON.parse((await GatherLockedSpaces.query().where({space_id: spaceId}))[0].restricted_spaces);
  
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
      const msg = `❌ DENIED ACCESS[${space.name}]:\n${requiredCondition}`;

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
  const restrictedAreas = JSON.parse((await GatherLockedSpaces.query().where({space_id: spaceId}))[0].restricted_spaces).map((e) => e.name);
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
  const permittedAreas = JSON.parse((await GatherPermittedAreas.query().where({wallet_address: playerWalletAddress}))[0].permitted_areas);

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

  let coordinates = (await GatherLockedSpaces.query().where({space_id: spaceId}))[0].initial_coordinates;
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
  
  if(lastCoordinates[playerId].length > 3){
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
// Initialise game instance
// @param { String } spaceId
// @return { void } 
//
const initGameInstance = (spaceId) => {
  console.log(`🔥 initGameInstance: ${spaceId}`)
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

}

// ========================================================================================
// +                                LOOP THROUGH ALL SPACES                               +
// +                                ---–––––---------------                               +
// + https://gathertown.notion.site/Gather-Websocket-API-bf2d5d4526db412590c3579c36141063 +
// ========================================================================================
let ALL_SPACES = await getAllSpacesId();

ALL_SPACES.forEach((spaceId) => {
  runningInstances.push(spaceId)
  initGameInstance(spaceId);
})

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
    runningInstances.push(spaceId)
    initGameInstance(spaceId)
  });


}, 60000);