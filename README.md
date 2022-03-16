# Gather Controller

# Features

## 16 March 2022

- [x] (backend) Added space deletion detection


## Models

- GatherLockedSpaces.js
- GatherPermittedAreas.js

## Commands

| Command | Example | Meaning | Note |
| --- | --- | --- | --- |
| /teleport {name} me | /teleport Chris me | teleport Chris to sender’s location | {name} is case sensitive |
| /teleport {name} 24,24 | /teleport Chris 24,24 | teleport Chris to (x:24, y:24) coordinates |  |
| /teleport {name} {area} | /teleport Chris “Poker Table” | teleport Chris to the centre of the “Poker Table” |  |
| /list | /list | List all restricted areas/rooms |  |