import { Game } from "@gathertown/gather-game-client";
import webSocket from "isomorphic-ws";
import { Model } from "objection";
import Knex from "knex";
import knexConfig from "./knexfile.js";
import TokenHolding from "./models/TokenHolding.js";
import ConnectedService from "./models/ConnectedService.js";

global.WebSocket = webSocket;

// Initialize knex.
const knex = Knex(knexConfig[process.env.NODE_ENV || "development"]);

// Give the knex instance to objection.
Model.knex(knex);

const API_KEY = process.env.LIT_GATHER_CONTROLLER_GATHER_API_KEY;
const INITIAL_LOCATION = [31, 32];
const ROOM = {
  boundingBox: { start: [0, 0], end: [6, 2] },
  contractAddress: "0x508f6057612b30b024dd054cabdf0c46a7124087",
  tokenId: "0xb89e5526cb48fedd0a4e90f055a043f58e785ed0",
  map: "Crypto Records",
};
const WALL_THICKNESS = 0;

const roomPermissionsCache = {};
const lastLocationCache = {};

const warpIfNotPermitted = (data, context) => {
  const { x, y } = data.playerMoves;
  let playerWarpedOut = false;

  // only check permission if the user is in a protected map
  if (context.player.map !== ROOM.map) {
    return playerWarpedOut;
  }

  // loop over the rooms.  if they are in a private room, evaluate if they are allowed
  // and return true / false
  // if they are not in a private room, return null
  // the nulls are filtered out leaving only an array with a single element
  // that is true / false if they are permitted
  let permittedInRoom = true;

  const boundingBox = ROOM.boundingBox;
  // console.log("checking if permitted in " + roomKey);
  if (
    x >= boundingBox.start[0] - WALL_THICKNESS &&
    x <= boundingBox.end[0] + WALL_THICKNESS &&
    y >= boundingBox.start[1] - WALL_THICKNESS &&
    y <= boundingBox.end[1] + WALL_THICKNESS
  ) {
    // user is in a private room.  are they allowed?
    // console.log(
    //   "user is in private room.  their roomPermissionsCache[context.playerId] is ",
    //   roomPermissionsCache[context.playerId]
    // );
    permittedInRoom = roomPermissionsCache[context.playerId].permitted;
  }

  // console.log("permittedInRooms", permittedInRooms);

  if (permittedInRoom === false) {
    // they are in a private room but they aren't allowed in it.  warp them.
    if (lastLocationCache[context.playerId]) {
      game.teleport(
        context.player.map,
        lastLocationCache[context.playerId][0],
        lastLocationCache[context.playerId][1],
        context.playerId
      );
    }

    playerWarpedOut = true;
    game.chat(
      context.playerId,
      [context.playerId],
      context.player.map,
      `Sorry, you are not permitted to enter this room.`
    );
  }

  return playerWarpedOut;
};

// only run when the user connects, and save the results in roomPermissionsCache
const setRoomPermissions = async (data, context) => {
  // check if the user is permitted
  const connectedService = (
    await ConnectedService.query().where({
      id_on_service: context.playerId,
      service_name: "gather",
    })
  )[0];
  console.log(
    "running setRoomPermissions for connectedService",
    connectedService
  );
  if (!roomPermissionsCache[context.playerId]) {
    roomPermissionsCache[context.playerId] = {};
  }
  if (connectedService) {
    const userAddress = connectedService.wallet_address;
    const qry = TokenHolding.query();
    const contractAddress = ROOM.contractAddress;
    const tokenHoldings = await qry.where({
      wallet_address: userAddress,
      contract_address: contractAddress.toLowerCase(),
    });

    if (tokenHoldings.length > 0) {
      roomPermissionsCache[context.playerId].permitted = true;
    } else {
      roomPermissionsCache[context.playerId].permitted = false;
    }
  } else {
    // user hasnt connected their wallet.  assume they are not allowed into any rooms.
    roomPermissionsCache[context.playerId].permitted = false;
  }
};

/**** setup ****/

// what's going on here is better explained in the docs:
// https://gathertown.notion.site/Gather-Websocket-API-bf2d5d4526db412590c3579c36141063
const game = new Game(() => Promise.resolve({ apiKey: API_KEY }));
game.connect("IIiU7UpulMdbsQ3w\\nostalgea"); // replace with your spaceId of choice
game.subscribeToConnection((connected) => console.log("connected?", connected));

/**** the good stuff ****/

game.subscribeToEvent("playerJoins", async (data, context) => {
  console.log("playerJoins with id", context.playerId);
  // game.teleport(
  //   context.player.map,
  //   INITIAL_LOCATION[0],
  //   INITIAL_LOCATION[1],
  //   context.playerId
  // );
  setRoomPermissions(data, context);
});

game.subscribeToEvent("playerMoves", async (data, context) => {
  // console.log(
  //   context?.player?.name ?? context.playerId,
  //   "moved to x,y",
  //   data.playerMoves.x,
  //   data.playerMoves.y
  // );
  // console.log("playerMoves", data, context);

  const { x, y } = data.playerMoves;

  if (!roomPermissionsCache[context.playerId]) {
    await setRoomPermissions(data, context);
  }

  // game.chat(
  //   context.playerId,
  //   [context.playerId],
  //   context.player.map,
  //   `You are at ${data.playerMoves.x}, ${data.playerMoves.y}`
  // );
  const playerWarpedOut = warpIfNotPermitted(data, context);
  if (!playerWarpedOut) {
    lastLocationCache[context.playerId] = [x, y];
  }
});

// game.subscribeToEvent("playerChats", (data, context) => {
//   console.log("chat from ", context.playerId);
//   console.log("data", data);
// });

// PlayerEntersPortal
