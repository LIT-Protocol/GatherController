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
const ROOMS = {
  theBar: {
    boundingBox: { start: [11, 29], end: [28, 39] },
    contractAddresses: [
      "0xB212AAbB89337947AF9A1cc41459A0D967C90Aec", // lit genesis gate
      "0xf5b0a3efb8e8e4c201e2a935f110eaaf3ffecb8d", // axie infinity
      "0xb7f7f6c52f2e2fdb1963eab30438024864c313f6", // Wrapped Cryptopunks
      "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb", // non wrapped punks
      "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", // Bored Ape Yacht Club
      "0xff488fd296c38a24cccc60b43dd7254810dab64e", // Zed Run
      "0x4b3406a41399c7FD2BA65cbC93697Ad9E7eA61e5", // LOSTPOETS
      "0xa3aee8bce55beea1951ef834b99f3ac60d1abeeb", // VeeFriends
      "0x57a204aa1042f6e66dd7730813f4024114d74f37", // CyberKongz
      "0x7EA3Cca10668B8346aeC0bf1844A49e995527c8B", // cyberkongz vx
      "0xff9c1b15b16263c61d017ee9f65c50e4ae0113d7", // Loot
      "0x7Bd29408f11D2bFC23c34f18275bBf23bB716Bc7", //Meebits
      "0x10daa9f4c0f985430fde4959adb2c791ef2ccf83", //Metakey
    ],
  },
  backOfBar: {
    boundingBox: { start: [31, 2], end: [43, 5] },
    contractAddresses: [
      "0x049aba7510f45ba5b64ea9e658e342f904db358d",
      "0x55485885e82e25446dec314ccb810bda06b9e01b",
    ],
  },
};

const roomPermissionsCache = {};
const lastLocationCache = {};

const warpIfNotPermitted = (data, context) => {
  const WALL_THICKNESS = 2;
  const { x, y } = data.playerMoves;
  let playerWarpedOut = false;

  // loop over the rooms.  if they are in a private room, evaluate if they are allowed
  // and return true / false
  // if they are not in a private room, return null
  // the nulls are filtered out leaving only an array with a single element
  // that is true / false if they are permitted
  const permittedInRooms = Object.keys(ROOMS)
    .map((roomKey) => {
      const boundingBox = ROOMS[roomKey].boundingBox;
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
        return roomPermissionsCache[context.playerId][roomKey];
      }
      return null;
    })
    .filter((r) => r !== null);

  // console.log("permittedInRooms", permittedInRooms);

  if (permittedInRooms.includes(false)) {
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

const setRoomPermissions = async (data, context) => {
  // check if the user is permitted
  const connectedService = (
    await ConnectedService.query().where({
      id_on_service: context.playerId,
      service_name: "gather",
    })
  )[0];
  // console.log("connectedService", connectedService);
  if (!roomPermissionsCache[context.playerId]) {
    roomPermissionsCache[context.playerId] = {};
  }
  if (connectedService) {
    const userAddress = connectedService.wallet_address;
    const tokenHoldingPromises = Object.keys(ROOMS).map((roomKey) => {
      const qry = TokenHolding.query();
      ROOMS[roomKey].contractAddresses.forEach((contractAddress, idx) => {
        if (idx === 0) {
          qry.where({
            wallet_address: userAddress,
            contract_address: contractAddress,
          });
        } else {
          qry.orWhere({
            wallet_address: userAddress,
            contract_address: contractAddress,
          });
        }
      });
      return qry.then((holdings) => ({ holdings, roomKey }));
    });
    const tokenHoldingsPerRoom = await Promise.all(tokenHoldingPromises);
    // console.log("tokenHoldingsPerRoom", tokenHoldingsPerRoom);
    tokenHoldingsPerRoom.forEach((tokenHoldings) => {
      const { roomKey } = tokenHoldings;
      // console.log(
      //   "tokenHoldings.holdings.length",
      //   tokenHoldings.holdings.length
      // );
      if (tokenHoldings.holdings.length > 0) {
        roomPermissionsCache[context.playerId][roomKey] = true;
      } else {
        roomPermissionsCache[context.playerId][roomKey] = false;
      }
    });
  } else {
    // user hasnt connected their wallet.  assume they are not allowed into any rooms.
    Object.keys(ROOMS).forEach((roomKey) => {
      roomPermissionsCache[context.playerId][roomKey] = false;
    });
  }
};

/**** setup ****/

// what's going on here is better explained in the docs:
// https://gathertown.notion.site/Gather-Websocket-API-bf2d5d4526db412590c3579c36141063
const game = new Game(() => Promise.resolve({ apiKey: API_KEY }));
game.connect("tXVe5OYt6nHS9Ey5\\lit-protocol"); // replace with your spaceId of choice
game.subscribeToConnection((connected) => console.log("connected?", connected));

/**** the good stuff ****/

game.subscribeToEvent("playerJoins", async (data, context) => {
  console.log("playerJoins with id", context.playerId);
  game.teleport(
    context.player.map,
    INITIAL_LOCATION[0],
    INITIAL_LOCATION[1],
    context.playerId
  );
  setRoomPermissions(data, context);
});

game.subscribeToEvent("playerMoves", async (data, context) => {
  console.log(
    context?.player?.name ?? context.playerId,
    "moved to x,y",
    data.playerMoves.x,
    data.playerMoves.y
  );

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
