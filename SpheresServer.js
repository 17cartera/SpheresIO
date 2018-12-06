"use strict"
//spheres IO server code
//global variables
require("./consts.js")(global)
var gameController; var graphics; var leaderBoard; //controller objects
var gameMap = new GameMap(); //an array of all nodes
var movingUnits = []; //an array of all MovingUnit groups
var teams = {}; //a list of all teams
var clients = []; //all playerControllers that are recieving game data (players and spectators)
var players = []; //all players that are actively spawned into the game
var cores = []; //all cores on the server
//initialization block
var initialize = function() 
{
	console.log("beginning game");
	gameController = new GameController();
	leaderBoard = new LeaderBoard();
}
///logic system
function GameController()
{
	//generate the neutral team
	let neutralTeam = new Team("rgb(128,128,128)",new Controller(0),"")
	neutralTeam.name = "" //force the neutral team to have no name
	console.log(neutralTeam.name)
	teams[0] = neutralTeam;
	this.generateMap(MAP_SIZE,MAP_SIZE);
	this.gameLoop = setInterval(gameTick,100); //ticks game updates
}
//generates a map
GameController.prototype.generateMap = function(height,width) 
{
	//generate the cores
	gameMap.addObject(new CoreNode(new Position(width/3,height/3)));
	gameMap.addObject(new CoreNode(new Position(2*width/3,height/3)));
	gameMap.addObject(new CoreNode(new Position(2*width/3,2*height/3)));
	gameMap.addObject(new CoreNode(new Position(width/3,2*height/3)));
	//generate the special nodes
	let x = 0;
	while (x < FACTORIES_TO_GENERATE)
	{
		let tempNode = new FactoryNode(new Position(Math.random()*width,Math.random()*height));
		if (this.placeNode(tempNode))
			x++;
	}
	x = 0;
	while (x < PORTALS_TO_GENERATE)
	{
		let tempNode = new PortalNode(new Position(Math.random()*width,Math.random()*height));
		if (this.placeNode(tempNode))
			x++;
	}
	x = 0;
	while (x < TURRETS_TO_GENERATE)
	{
		let tempNode = new TurretNode(new Position(Math.random()*width,Math.random()*height));
		if (this.placeNode(tempNode))
			x++;
	}
	x = 0; let generatedNodes = MIN_NODES_TO_GENERATE+Math.floor(Math.random()*(MAX_NODES_TO_GENERATE-MIN_NODES_TO_GENERATE));
	//adds nodes only where there is empty space available;
	while (x < generatedNodes) 
	{
		let tempNode = new Node(new Position(Math.random()*width,Math.random()*height),1+Math.floor(Math.random()*5));
		//determine if there is sufficient space between this node and all other nodes
		if (this.placeNode(tempNode))
			x++;
	}
	//spawns teams to populate the map with AI bots
	let t = 1;
	while (t <= BOT_COUNT) 
	{
		this.spawnNewPlayer(new BotController(0),"Bot");
		t++;
	}
}
//attempts to place a node
GameController.prototype.placeNode = function(tempNode)
{
	let isClear = true;
	let potentialObstructions = gameMap.getAllInRange(tempNode.pos,250);
	for (let n in potentialObstructions) 
	{
		if (Position.getDistance(tempNode.pos,potentialObstructions[n].pos) <= (tempNode.size+potentialObstructions[n].size)*2+30)
			isClear = false;
	}
	//push the node
	if (isClear)
	{
		gameMap.addObject(tempNode);
		tempNode.units[0] = new Units(0,10+Math.floor(Math.random()*40));
		addPacket({type:"addNode",newNode:tempNode});
		return true;
	}
	else
	{
		return false;
	}
}
//attempts to destroy a node
GameController.prototype.destroyNode = function(node)
{
	//revert the node to neutral and remove all units to purge its lingering data
	for (let u in node.units)
		node.addUnits(node.units[u].team,-node.units[u].number);
	node.changeTeam(0);
	//check moving groups and destroy those that lead to this target	
	for (let n = movingUnits.length-1; n >= 0; n--) //kill moving units
	{
		let group = movingUnits[n]
		if (group.endNode == node)
		{
			addPacket({type:"groupLoss",id:group.id,number:group.number}) //send deletion to client
			movingUnits.splice(n,1) //delete the moving group
		}
	}
	//execute deletion from main grid
	addPacket({type:"removeNode",node:node.id});
	gameMap.removeObject(node);
}
//spawns in a new player
GameController.prototype.spawnNewPlayer = function(controller,name)
{
	let team = new Team(generateRandomColor(),controller,name);
	//find an index for the team
	let teamIndex = 1, isIndexFound = false;
	while (!isIndexFound)
	{
		if (teams[teamIndex] == undefined)
			isIndexFound = true;
		else
			teamIndex++
	}
	controller.team = teamIndex
	teams[teamIndex] = team;
	addPacket({type:"addTeam",index:teamIndex,color:team.color,name:team.name})
	let isValidLocationFound = false;
	let node;
	let counter = 0;
	while (!isValidLocationFound) //ensure that the location is neutral
	{
		counter++;
		let index = Math.floor(Math.random()*gameMap.allObjects.length);
		node = gameMap.allObjects[index];
		if (node.team == 0 && node.nodeType == undefined) 
		{
			isValidLocationFound = true;
			for (let u in node.units)
				node.addUnits(node.units[u].team,-node.units[u].number)
			node.changeTeam(teamIndex);
			node.addUnits(teamIndex,100);
		}
		else if (counter > 10000) //force a spawn over a player's node if necessary
		{
			console.log("No neutral nodes, forced to overspawn player")
			isValidLocationFound = true;
			for (let u in node.units)
				node.addUnits(node.units[u].team,-node.units[u].number)
			node.changeTeam(teamIndex);
			node.addUnits(teamIndex,100);
		}
	}
	return node;
}
//restarts the server
GameController.prototype.restartGame = function(winner)
{
	console.log("Restarting server")
	//disconnect clients
	let disconnectMessage = (winner == undefined) ? "Server Restarting" : winner.name + " Has won the game!";
	for (let p in clients)
	{
		clients[p].sendPacket({type:"disconnectMessage",message:disconnectMessage});
	}
	//exits the server, foreverJS should immediately pick up and restart
	setTimeout(function(){process.exit()},1000);
}
//triggers secondary timers
function gameTick()
{
	for (let index in gameMap.allObjects)
	{
		let node = gameMap.allObjects[index];
		//if a node has more than one team of units on it, start a battle
		if (node.units.length > 1 && !node.fighting) 
			node.fight(node.units);
		//if a node is under control by units from a different team than its own team, capture it
		if (node.units.length == 1 && (node.units[0].team != node.team || node.capturePoints > 0) && !node.capturing) 
			node.capture();
		//if a node is non-neutral, attempt to spawn
		if (node.team != 0 && (node.getUnitsOfTeam(node.team) != 0 || node.units.length == 0) && !node.spawning)
			node.spawn();
		//check nonspecial nodes for attrition
		if (node.nodeType == undefined && !node.attrition)
			node.checkForAttrition();
	}
	//spawn bots every so often if conditions are met
	let numTeams = Object.keys(teams).length-1; //all teams other than the neutral team
	if (numTeams < MIN_PLAYERS && numTeams-players.length < BOT_COUNT && Math.random()*1000 <= 1) 
	{
		console.log("Spawning a new bot")
		gameController.spawnNewPlayer(new BotController(teams.length),"Bot");
	}
	//change up the map
	if (Math.random()*100 <= 1)
	{
		//add a new node
		while(!gameController.placeNode(new Node(new Position(Math.random()*MAP_SIZE,Math.random()*MAP_SIZE),
		1+Math.floor(Math.random()*5)))){}
		//remove a non-special node
		let index = 0;
		do
			index = Math.floor(Math.random()*gameMap.allObjects.length)
		while (gameMap.allObjects[index].nodeType != undefined)
		gameController.destroyNode(gameMap.allObjects[index]);
	}
}
///hash map code
function GameMap()
{
	this.size = MAP_SIZE/HASH_SIZE;
	this.allObjects = []; //contains all objects on the map
	this.map = new Array(this.size); //create first dimension
	for (let x = 0; x < this.size; x++) 
	{
		this.map[x] = new Array(this.size); //create second dimension
		for (let y = 0; y < this.size; y++)
		{
			this.map[x][y] = []; //creates a blank array to hold objects at this node
		}
	}
}
//adds an object at this location
GameMap.prototype.addObject = function(object) 
{
	this.allObjects.push(object);
	let x = Math.floor(object.pos.x/HASH_SIZE);
	let y = Math.floor(object.pos.y/HASH_SIZE);
	this.map[x][y].push(object);
}
//removes an object from the grid
GameMap.prototype.removeObject = function(object)
{
	//identify the object
	for (let n in this.allObjects)
	{
		if (this.allObjects[n] == object)
		{
			this.allObjects.splice(n,1);
			break;
		}
	}
	//remove from the object's location in hash map
	let x = Math.floor(object.pos.x/HASH_SIZE);
	let y = Math.floor(object.pos.y/HASH_SIZE);
	for (let n in this.map[x][y])
	{
		if (this.map[x][y][n] == object)
		{
			this.map[x][y].splice(n,1);
			break;
		}
	}
}
//move an object, updating its hash map position if necessary
GameMap.prototype.moveObject = function(object,newPos)
{
	//check if object needs to be moved on hash map
	if (Math.floor(object.pos.x/HASH_SIZE) != Math.floor(newPos.x/HASH_SIZE) 
	|| Math.floor(object.pos.y/HASH_SIZE) != Math.floor(newPos.y/HASH_SIZE))
	{
		//clear from old hash map position
		let x = Math.floor(object.pos.x/HASH_SIZE);
		let y = Math.floor(object.pos.y/HASH_SIZE);
		for (let n in this.map[x][y])
		{
			if (this.map[x][y][n] == object)
			{
				this.map[x][y].splice(n,1);
				break;
			}
		}
		//add to new hash map position
		x = Math.floor(newPos.x/HASH_SIZE);
		y = Math.floor(newPos.y/HASH_SIZE);
		this.map[x][y].push(object);
	}
	object.pos = newPos;
}
//range-checking
GameMap.prototype.getAllInRange = function(pos,range) 
{
	let radius = Math.ceil(range/HASH_SIZE);
	let x = Math.floor(pos.x/HASH_SIZE);
	let y = Math.floor(pos.y/HASH_SIZE);
	let output = [];
	for (let dx = -radius; dx <= radius; dx++) 
	{
		if (x+dx >= 0 && x+dx < this.size)
		for (let dy = -radius; dy <= radius; dy++)
		{
			if (y+dy >= 0 && y+dy < this.size)
			{
				for (let obj in this.map[x+dx][y+dy])
				{
					let pos2 = this.map[x+dx][y+dy][obj];
					if (Position.getDistance(pos,pos2.pos) <= range)
					{
						output.push(pos2);
					}
				}
			}
		}
	}
	return output;
}
//find the nearest node (optimized getAllInRange)
GameMap.prototype.getNearestNode = function(pos,max)
{
	let radius = Math.ceil(range/HASH_SIZE);
	let x = Math.floor(pos.x/HASH_SIZE);
	let y = Math.floor(pos.y/HASH_SIZE);
	let result = undefined;
	let resultDistance = max
	for (let dx = -radius; dx <= radius; dx++) 
	{
		if (x+dx >= 0 && x+dx < this.size)
		for (let dy = -radius; dy <= radius; dy++)
		{
			if (y+dy >= 0 && y+dy < this.size)
			{
				for (let obj in this.map[x+dx][y+dy])
				{
					let pos2 = this.map[x+dx][y+dy][obj];
					let dist = Position.getDistance(pos,pos2.pos) 
					if (dist <= resultDistance)
					{
						result = pos2;
						resultDistance = dist;
					}
				}
			}
		}
	}
	return result;
}

//class for nodes
function Node(position,level) 
{
	this.id = generateNodeID(); //unique ID of this node
	this.pos = position; //position of the node
	this.level = level; //level of the node, influences capture speed and unit production
	this.size = (20+10*level)*SIZE_SCALE; //size of the node is based on level
	this.team = 0; //nodes are created neutral by default
	this.units = []; //a listing of all unit groups that are on this node
	this.fighting = false; //whether or not the node is fighting
	this.capturing = false; //whether or not the node is being captured
	this.spawning = false; //whether or not the node is spawning units
	this.attrition = false; //whether this node is suffering attrition
	this.capturePoints = 0; //percentage of base that was captured
	this.captureTeam = undefined; //the team that is capturing the node (undefined if no team is capturing)
}
//returns the amount of units of the given team on this node
Node.prototype.getUnitsOfTeam = function(team)
{
	for (let index in this.units) 
	{
		let group = this.units[index];
		if (group.team == team)
			return group.number;
	}
	//if no group is found, return 0
	return 0;
}
//sums the total amount of units on this node
Node.prototype.getTotalUnits = function() 
{
	let sum = 0;
	for (let index in this.units) 
	{
		sum += this.units[index].number;
	}
	return sum;	
}
//adds (or removes if parameter is negative) units to the node
Node.prototype.addUnits = function(team,number,effect) 
{
	let isAdded = false;
	for (let index in this.units) 
	{
		let group = this.units[index];
		if (group.team == team) 
		{
			group.number += number;
			if (group.number <= 0) //delete an index with no units
			{
				//log when negative units occur
				if (group.number < 0)
					console.log("Negative units detected")
				this.units.splice(index,1);
				if (this.team != group.team) teams[group.team].controller.removeOccupiedNode(this);
			}
			isAdded = true;
		}
	}
	if (isAdded == false && number != 0) 
	{
		this.units.push(new Units(team,number));
		teams[team].controller.addOccupiedNode(this);
	}
	let packet = {type:"units",node:this.id,team:team,number:number,effect:effect}
	addPacket(packet)
}
//method to properly change the team of a node
Node.prototype.changeTeam = function(newTeam) 
{
	if (this.team != 0) 
		{teams[this.team].controller.removeOccupiedNode(this);} //team 0 does not have a controller
	this.team = newTeam;
	if (newTeam != 0) 
		{teams[newTeam].controller.addOccupiedNode(this);} //team 0 does not have a controller
	addPacket({type:"capture",node:this.id,team:newTeam})
}
//spawns a unit at this node if conditions are right 
Node.prototype.spawn = function() 
{
	this.spawning = true;
	let unitCount = this.getUnitsOfTeam(this.team)
	let delay = (SPAWN_TIME*1000)/this.level;
	delay *= 1+Math.max(teams[this.team].controller.getTotalUnits()-REINFORCEMENT_CAP,0)/UNITS_PER_SPAWN_MULTIPLIER;
	if (this.fighting) delay *= FIGHT_SPAWN_MULTIPLIER; //units take twice as long to spawn while in combat?
	//conditions: must not be dealing with attrition, must not be at capacity, must have friendly units or no units
	if (!this.attrition && !teams[this.team].controller.isCapacityReached() && (unitCount != 0 || this.units.length == 0))
	{
		this.addUnits(this.team,1);
		setTimeout(function(_this){_this.spawn();},delay,this);
	}
	else //set a delay to prevent instant respawning on the next update tick
	{
		setTimeout(function(_this){_this.spawning = false;},delay,this);
	}
}
//capturing function
Node.prototype.capture = function() 
{
	this.capturing = false; //set this to false by default
	if (this.units.length != 1) //if there are no units here or a combat, no capture can occur
		return;
	if (this.captureTeam != undefined && this.units[0].team != this.captureTeam) //if another team arrives, they drain the capture points
	{
		if (this.capturePoints <= 0)//clear the capture
			this.captureTeam = undefined;
		else //slowly drain the capture points
			this.capturePoints = Math.max(this.capturePoints-2,0);
		addPacket({type:"assault",node:this.id,points:this.capturePoints,team:this.captureTeam}) //update the capture points on the node
		return;
	}
	this.captureTeam = this.units[0].team;
	if (this.capturePoints >= 100) 
	{
		//node first turns to neutral before being captured
		if (this.team != 0) 
		{	
			this.changeTeam(0);
		}
		else
		{
			this.changeTeam(this.units[0].team);
		}
		this.captureTeam = undefined;
		this.capturePoints = 0;
	}
	else 
	{
		this.capturePoints++;
		this.capturing = true; //currently capturing, do not trigger a game update tick on this
		let delay = (CAPTURE_TIME*100*this.level)/Math.min(this.units[0].number,MAX_UNITS);
		setTimeout(function(_this){_this.capture();},delay,this);
	}
	addPacket({type:"assault",node:this.id,points:this.capturePoints,team:this.captureTeam})
}
//combat mechanics system (ported from BattleFunction program)
Node.prototype.fight = function()
{
	//add the numbers of all teams to a total number
	let unitNums = this.units;
	var totalUnits = this.getTotalUnits()
	if (totalUnits <= 0) return; //prevent a possible bug if all units leave the node at the exact same time
	//choose a random unit out of all units to attack
	var attackerLocation = Math.floor(Math.random()*totalUnits)+1;
	var attackerFound = false;
	var index = 0;
	while (!attackerFound)
	{
		attackerLocation -= unitNums[index].number //subtract the unitnums from this
		if (attackerLocation <= 0) //if this is <= 0, the attacker is in the current index
			attackerFound = true;
		else
			index++;
	}
	for (let x = 0; x < unitNums.length; x++) //every array that is not the attacker loses 1 unit
	{
		if (x != index)
			this.addUnits(unitNums[x].team,-1,true)
	}
	//continue fighting if a fight is still needed 
	if (unitNums.length > 1)
	{
		//find the strongest group on this node
		let strongestNum = 0;
		for (let n in this.units)
			strongestNum = Math.max(strongestNum,unitNums[n].number)
		let delay = Math.min((FIGHT_TIME*10000)/(Math.min(totalUnits,Math.max(MAX_UNITS,2*(totalUnits-strongestNum))))
			,FIGHT_TIME*1000);
		setTimeout(function(_this){_this.fight();},delay,this);
		this.fighting = true;
	}
	else 
	{
		this.fighting = false;
	}
	return unitNums; //returns unitNums if needed
}
//attritions away units from the node if >100 are present
Node.prototype.checkForAttrition = function()
{
	this.attrition = false //will be set to true by later events
	for (let index in this.units) 
	{
		let group = this.units[index];
		if (group.number > MAX_UNITS)
		{
			this.attrition = true;
			this.addUnits(group.team,-1)
			let delay = Math.min((NODE_ATRIT_TIME*5000*this.level)/(group.number-MAX_UNITS),NODE_ATRIT_TIME*1000);
			setTimeout(function(_this){_this.checkForAttrition();},delay,this);
		}
	}
}
//special node type: factory, high production unless fighting
FactoryNode.prototype = new Node();
FactoryNode.prototype.constructor = FactoryNode;
function FactoryNode(position)
{
	Node.call(this,position,10);
	this.size = 125*SIZE_SCALE;
	this.nodeType = "factory";
}
FactoryNode.prototype.spawn = function() //factory nodes do not spawn if in combat
{
	this.spawning = true;
	//let rate = NODE_SPAWN_RATE*this.level+TEAM_SPAWN_RATE/teams[this.team].controller.occupiedNodes.length;
	let delay = 1000/FACTORY_PRODUCTION
	if (!teams[this.team].controller.isCapacityReached() && this.units.length <= 1)
	{
		this.addUnits(this.team,1);
		setTimeout(function(_this){_this.spawn();},delay,this);
	}
	else 
	{
		setTimeout(function(_this){_this.spawning = false;},delay,this);
	}
}
//special node type: turret, shoots at nearby enemy unit groups
TurretNode.prototype = new Node();
TurretNode.prototype.constructor = TurretNode;
function TurretNode(position)
{
	Node.call(this,position,5);
	this.nodeType = "turret";
	setInterval(function(_this){_this.checkLaser();},1000/TURRET_ROF,this);
}
//turrets do not spawn
TurretNode.prototype.spawn = function()
{
	return;
}
//runs laser shot calculations
TurretNode.prototype.checkLaser = function()
{
	if (this.team == 0) return; //do not activate if neutral
	if ((this.fighting || this.capturing) && Math.random() < 0.5) return; //50% of all shots fail while the turret is in combat
	let closestGroup,closestRange = TURRET_RANGE;
	for (let u in movingUnits) //check to see if an enemy group is within turret range
	{
		let group = movingUnits[u]
		let distance = Position.getDistance(this.pos,group.pos)
		if (distance < closestRange && group.team != this.team) 
		{
			closestGroup = group;
			closestRange = distance;
		}
	}
	if (closestGroup != undefined) //shoot the closest detected enemy group
	{
		closestGroup.number -= 1;
		addPacket({type:"groupLoss",id:closestGroup.id,number:1,laser:this.id})
	}
}
//special node type: portal, teleports units of the controlled team
PortalNode.prototype = new Node();
PortalNode.prototype.constructor = PortalNode;
function PortalNode(position)
{
	Node.call(this,position,5);
	this.nodeType = "portal";
	this.ready = true;
}
//portals do not spawn
PortalNode.prototype.spawn = function()
{
	return;
}
//function to allow the portal node to teleport units
PortalNode.prototype.teleport = function(endNode,unitsTransferred)
{
	this.addUnits(this.team,-unitsTransferred);
	if (unitsTransferred > MAX_UNITS)
		unitsTransferred -= Math.floor((unitsTransferred-MAX_UNITS)*PORTAL_ATTRITION)
	endNode.addUnits(this.team,unitsTransferred);
	addPacket({type:"teleport",number:unitsTransferred,node:this.id,otherNode:endNode.id})
	//put the portal in cooldown
	this.ready = false;
	setTimeout(function(_this){_this.ready = true},unitsTransferred*PORTAL_DELAY,this);
}
//special node type: core, cannot be directly accessed
CoreNode.prototype = new Node();
CoreNode.prototype.constructor = CoreNode;
function CoreNode(position)
{
	Node.call(this,position,0);
	this.size = CORE_SIZE;
	this.nodeType = "core";
	//generate orbitals
	this.orbitals = [];
	for (let angle = 0; angle < 1.99*Math.PI; angle += Math.PI/3)
	{
		let tempNode = new OrbitalNode(this,angle);
		tempNode.addUnits(0,100);
		this.orbitals.push(tempNode);
		gameMap.addObject(tempNode);
	}
	setInterval(function(_this){_this.rotateNodes();},100/CORE_ROTATION,this);
	//register this with the game controller
	cores.push(this);
}
//cores do not spawn (and also cannot accept units)
CoreNode.prototype.spawn = function()
{
	return;
}
//rotates all orbitals and also checks to see if this should be captured
CoreNode.prototype.rotateNodes = function()
{
	//rotate the orbitals
	for (let n in this.orbitals)
	{
		this.orbitals[n].orbit(0.1*Math.PI/180);
	}
	//check to see if this node should be captured
	let captureTeam = this.orbitals[0].team
	if (captureTeam != 0 && captureTeam == this.orbitals[1].team && captureTeam == this.orbitals[2].team
		&& captureTeam == this.orbitals[3].team && captureTeam == this.orbitals[4].team && captureTeam == this.orbitals[5].team)
	{
		if (this.team != captureTeam)
		{
			this.changeTeam(captureTeam);
			//check victory conditions (must control at least 75% of the cores on the map to win)
			let alignedCores = 0;
			for (let n in cores)
			{
				if (cores[n].team == this.team)
					alignedCores++;
			}
			if (alignedCores/cores.length >= 0.75)
				gameController.restartGame(teams[this.team])
		}
	}
	else if (this.team != 0)
		this.changeTeam(0);
}
//special node type: orbital nodes around a core
OrbitalNode.prototype = new Node();
OrbitalNode.prototype.constructor = OrbitalNode;
function OrbitalNode(core,angle)
{
	this.corePos = core.pos;
	this.angle = angle;
	Node.call(this,new Position(this.corePos.x+CORE_SIZE*Math.cos(angle),this.corePos.y+CORE_SIZE*Math.sin(angle)),5);
	this.nodeType = "orbital";
}
OrbitalNode.prototype.orbit = function(added)
{
	this.angle += added;
	gameMap.moveObject(this,new Position(this.corePos.x+CORE_SIZE*Math.cos(this.angle),this.corePos.y+CORE_SIZE*Math.sin(this.angle)))
	addPacket({type:"nodemove",node:this.id,pos:this.pos});
}

//an object for a moving group of units
function MovingGroup(team,number,startNode,endNode) 
{
	this.id = generateMovingGroupID(); //unique ID of this moving group
	this.team = team;
	this.number = number;
	this.startNode = startNode;
	this.endNode = endNode;
	this.pos = new Position(startNode.pos.x,startNode.pos.y);
	this.lastEndPos = this.endNode.pos; //position that the endNode is at, will be out of date if endnode moves
	this.direction = Position.getDirection(this.startNode.pos,this.endNode.pos);	
	this.remainingDistance = Position.getDistance(this.startNode.pos,this.endNode.pos);
	this.lastMoveTime = new Date(); //time when the last move order was executed, should be at most 17 without any lag
	this.attritLosses = 0; //fractional component of losses to attrition
	this.nextCheckDistance = (startNode.team == team) ? CONTROL_RANGE : CONTROL_RANGE/10; //minimum distance that can be crossed before another attrition check is needed
}
//moves the group towards its destination
MovingGroup.prototype.move = function() 
{
	//if there are 0 units on this node, destroy it
	if (this.number <= 0)
	{
		if (!teams[this.team] && teams[this.team].controller.getTotalUnits() <= 0) //a team cannot lose their last unit as a moving group
			this.number == 1
		else
			return "destroyed"
	}	
	//check if destination node has moved, if so update direction and distance
	if (this.lastEndPos != this.endNode.pos)
	{
		this.direction = Position.getDirection(this.pos,this.endNode.pos);
		this.remainingDistance = Position.getDistance(this.pos,this.endNode.pos);
		this.lastEndPos = this.endNode.pos;
	}
	//move based on dt
	let currentTime = new Date();
	let distance = MOVE_SPEED*(currentTime-this.lastMoveTime)/1000
	this.lastMoveTime = currentTime
	this.pos.x += distance*Math.cos(this.direction);
	this.pos.y += distance*Math.sin(this.direction);
	this.remainingDistance -= distance;
	//if close to the end node, add this group's units to that node
	if (this.remainingDistance <= this.endNode.size) 
	{
		this.endNode.addUnits(this.team,this.number);
		//remove this group from array
		for (let n in movingUnits) 
		{
			let checkedGroup = movingUnits[n];
			if (checkedGroup == this)
				movingUnits.splice(n,1);
		}
	}
	//otherwise, check for attrition
	else 
	{
		this.checkForAttrition(distance)
	}
}
//checks for attrition
MovingGroup.prototype.checkForAttrition = function(distance)
{
	if (teams[this.team] == undefined) //if the team is invalid, destroy this moving group
	{
		console.log("Invalid Moving Group Team");
		addPacket({type:"groupLoss",id:this.id,number:this.number})
		this.number = 0;
		return;
	}
	let nearFriendly = false;
	if (this.nextCheckDistance > distance) //if nearestfriendlydistance > 0, cannot need an attrition check
	{
		this.nextCheckDistance -= distance
		nearFriendly = true;
	}
	else //check all nodes in control range to see if one is friendly
	{
		let nearbyNodes = gameMap.getAllInRange(this.pos,CONTROL_RANGE)
		for (let n in nearbyNodes)
		{
			let node = nearbyNodes[n]
			if (this.team == node.team)
			{
				nearFriendly = true;
				//set distance before another check
				this.nextCheckDistance = Math.max(this.nearestFriendlyDistance,CONTROL_RANGE-Position.getDistance(this.pos,node.pos))
				break;
			}
		}
	}
	let atritNumber = this.number
	if (nearFriendly)
	{
		atritNumber = (atritNumber-MAX_UNITS)/2
	}
	if (atritNumber > 0) //trigger attrition
	{
		//percentage of attrition per tick: (distance travelled)/(ATRIT_RATE/ln(0.5)(aka -.693))
		this.attritLosses += atritNumber * (distance/ATRIT_RATE)*.693;
		if (this.attritLosses >= 1)
		{
			let intLosses = Math.floor(this.attritLosses)
			this.number -= intLosses;
			addPacket({type:"groupLoss",id:this.id,number:intLosses})
			this.attritLosses-= intLosses
		}
	}
}
//unit move loop
function moveAllGroups()
{
	for (var u in movingUnits)
	{
		if(movingUnits[u].move() == "destroyed")
		{
			movingUnits.splice(u,1)
			u--;
		}
	}
}
setInterval(moveAllGroups,1000/60)

//a simple position object, used for certain inherited methods
function Position(x,y)
{
	this.x = x; this.y = y;
}
//returns the distance between two Position objects
Position.getDistance = function(pos1,pos2) 
{
	return Math.sqrt(Math.pow(pos2.x-pos1.x,2)+Math.pow(pos2.y-pos1.y,2));
}
//returns the direction between two Position objects
Position.getDirection = function(pos1,pos2)
{
	let result = Math.atan2(pos2.y-pos1.y,pos2.x-pos1.x);
	if (result == 0) //what is this for?
		console.log("invalid direction");
	return result;
}

//an object for a unit group (may not be needed)
function Units(team,number)
{
	this.team = team;
	this.number = number;
	//this.unitMap = []; //a map of the angle and direction of all units for the graphics system to draw
	//this.addUnits(this.number);
}
//returns a random color for a team
function generateRandomColor() 
{
	let isColorValid = false;
	let red, green, blue;
	while (!isColorValid) 
	{
		red = Math.floor(Math.random()*256);
		green = Math.floor(Math.random()*256);
		blue = Math.floor(Math.random()*256);
		if (red+green+blue >= 60) //color must be bright enough
			isColorValid = true;
	}
	return 'rgb(' + red + ',' + green + ',' + blue + ')';
}

///leaderboard mechanic
function LeaderBoard() 
{
	this.top10 = [];
	setTimeout(function(_this){_this.getLeaders();},1000,this);
}
//get the leaders
LeaderBoard.prototype.getLeaders = function() 
{
	let allActiveTeams = [];
	//remove eliminated teams
	for (let t in teams)
	{
		if (t != 0) //do not push neutral team
			allActiveTeams.push(teams[t])
	}
	allActiveTeams.sort(function (a,b) //sort by unit capacity (develop a scoring system later?)
	{
		return b.controller.unitCapacity-a.controller.unitCapacity;
	});
	this.top10 = allActiveTeams.slice(0,10);
	//transmit leaderboard data to players
	let leaderData = []
	for (let t in leaderBoard.top10)
	{
		let team = leaderBoard.top10[t]
		if (team == undefined) //second check if undefined due to crashes here
			continue;
		leaderData.push({color:team.color,name:team.name,score:team.controller.unitCapacity})
	}
	for (let p in clients)
	{
		clients[p].client.emit("leaderboard",leaderData)
	}
	setTimeout(function(_this){_this.getLeaders();},1000,this); //automatically recalculate leaders every 5 seconds
}

///object for a team
function Team(color,controller,name) 
{
	this.color = color;
	this.controller = controller;
	this.name = name || "An Unnamed Team";
}

///main controller class, inherited by subclasses
function Controller(team) 
{
	this.occupiedNodes = []; //list of all nodes with this team's units on them, or that are owned by this team
	this.moveOrders = []; //list of all move orders that are queued up
	this.team = team; //ID of this controller's team
	this.unitCapacity = 0; //this team's unit capacity
}
//adds a move order to this controller's queue
Controller.prototype.addMoveOrder = function(startNode,endNode,unitsTransferred,time)
{
	//check to see if this move order is already present
	for (let n in this.moveOrders)
	{
		let move = this.moveOrders[n];
		if (startNode == move.startNode && endNode == move.endNode)
		{
			move.unitsTransferred += unitsTransferred
			return;
		}
	}
	time = (time == undefined) ? new Date() : new Date(time); //if a timestamp has been provided use that instead
	this.moveOrders.push({startNode:startNode,endNode:endNode,unitsTransferred:unitsTransferred,time:time});
	let delay = Math.max(MOVE_DELAY+1-(new Date()-time),100)
	if (delay > MOVE_DELAY+1)
	{
		console.log("Move delay too large");
		console.log(new Date()-time);
		console.log(delay);
		delay = MOVE_DELAY+1;
	}
	setTimeout(function(_this){_this.checkMoves()},delay,this);
	/*
	setTimeout(function(_this,startNode,endNode,unitsTransferred)
	{_this.moveUnits(startNode,endNode,unitsTransferred)}
	,delay,startNode,endNode,unitsTransferred)
	*/
}
//checks all move orders and executes any that are ready
Controller.prototype.checkMoves = function()
{
	let time = new Date()
	for (let index = this.moveOrders.length-1; index >= 0; index--)
	{
		let move = this.moveOrders[index];
		if (time - move.time >= MOVE_DELAY)
		{
			this.moveUnits(move.startNode,move.endNode,move.unitsTransferred);
			this.moveOrders.splice(index,1);
		}
	}
}
//creates a moving group between the target node and the other node
Controller.prototype.moveUnits = function(startNode,endNode,unitsTransferred)
{
	if (unitsTransferred != 0 && startNode != endNode) //check for valid move
	{
		if (unitsTransferred > startNode.getUnitsOfTeam(this.team)) //prevent moving more units than are available
			unitsTransferred = startNode.getUnitsOfTeam(this.team)
		if (startNode.nodeType == "portal" && startNode.team == this.team && startNode.ready) //portals teleport instead of a normal move
		{
			startNode.teleport(endNode,unitsTransferred);
			return;
		}
		startNode.addUnits(this.team,-unitsTransferred);
		let moveGroup = new MovingGroup(this.team,unitsTransferred,startNode,endNode);
		movingUnits.push(moveGroup);
		addPacket({type:"move",team:this.team,number:unitsTransferred,node:startNode.id,otherNode:endNode.id,id:moveGroup.id})
		return moveGroup;
	}
}
//adds a controlled node
Controller.prototype.addOccupiedNode = function(node) 
{
	//check for duplicates
	let isDuplicate = false;
	for (var n in this.occupiedNodes) 
	{
		if (this.occupiedNodes[n] == node)
		{
			isDuplicate = true;
		}
	}
	if (!isDuplicate)
	{
		this.occupiedNodes.push(node);
	}
	this.calculateUnitCapacity(); //an addOccupiedNode call triggers on a team change, so always recalculate unit capacity
}
//removes a controlled node
Controller.prototype.removeOccupiedNode = function(node) 
{
	for (var n in this.occupiedNodes) 
	{
		if (this.occupiedNodes[n] == node) 
		{
			this.occupiedNodes.splice(n,1);
			//check to see if this team is eliminated
			if (this.team != 0 && this.getTotalUnits() == 0 && this.occupiedNodes.length == 0) 
			{
				console.log("Player " + teams[this.team].name + " (" + this.team + ")" + " has been eliminated")
				//console.log(teams)
				delete teams[this.team];
				addPacket({type:"removeTeam",index:this.team});
				//teams[this.team] = undefined
				//console.log(teams)
			}
			break;
		}
	}
	this.calculateUnitCapacity();
}
//calculates unit capacity
Controller.prototype.calculateUnitCapacity = function() 
{
	if (this.team == 0) return 0; //neutral team has no unit capacity
	this.unitCapacity = REINFORCEMENT_CAP; //start at base capacity
	for (let n in this.occupiedNodes) //add capacity for each owned node
	{
		let node = this.occupiedNodes[n];
		if (this.getOwner(node) == 1)
			if (node.nodeType == undefined || node.nodeType == "orbital")
				this.unitCapacity += node.level*UNITS_PER_LEVEL;
			else if (node.nodeType == "core")
				this.unitCapacity += 200;
	}
	return this.unitCapacity;
}
//sums up all units in all nodes
Controller.prototype.getTotalUnits = function() 
{
	let totalUnits = 0;
	for (let n in this.occupiedNodes) 
	{
		totalUnits += this.occupiedNodes[n].getUnitsOfTeam(this.team);
	}
	for (let n in movingUnits) 
	{
		if (movingUnits[n].team == this.team)
			totalUnits += movingUnits[n].number;
	}
	return totalUnits;
}
//returns true if total units is greater than unit capacity, otherwise false
Controller.prototype.isCapacityReached = function() 
{
	return (this.getTotalUnits() >= this.unitCapacity);
}
//a method for determining whether something is part of this team
Controller.prototype.getOwner = function(node) 
{
	if (node.team == this.team)
		return 1;
	if (node.team == 0)
		return 0;
	else return -1;
}

///controller object for a bot, AI system
BotController.prototype = new Controller();
BotController.prototype.constructor = BotController;
function BotController(team) 
{
	Controller.call(this,team);
	setInterval(function(_this){_this.runAI();},100,this); //AI ticks
	//AI configuration
	this.expansionWeight = 0.5+Math.random(); //weight of expanding and gaining territory
	this.attackWeight = 0.5+Math.random(); //weight of attacking and eliminating other players
	this.defenseWeight = 0.5+Math.random(); //weight of protecting nodes and units
	this.movePercentage = 0.3+Math.random()*0.6; //percentage of units the AI moves each move order
	this.reaction = 0.02+Math.random()*0.08; //chance of the AI acting every AI tick (aka the speed the AI moves)
}
//main AI loop
BotController.prototype.runAI = function() 
{
	//get the available moves for the AI
	//this.getData();
	//assign values
	//this.assignValues();
	if (Math.random() <= this.reaction && this.occupiedNodes.length != 0 && players.length > 0) 
	{
		this.getData();
		this.assignValues();
		//search for the highest value move, with some randomness
		let chosenMove = null;
		let chosenValue = 0;
		for (let m in this.availableMoves) 
		{
			let move = this.availableMoves[m];
			let tempValue = move.value * Math.random();
			if (tempValue > chosenValue) 
			{
				chosenMove = move;
				chosenValue = tempValue;
			}
		}
		//make the chosen move
		if (chosenMove != null)
			this.addMoveOrder(chosenMove.origin,chosenMove.target,Math.floor(chosenMove.origin.getUnitsOfTeam(this.team)*this.movePercentage));
		//occasionally change the move percentage
		if (Math.random() < 0.1)
			this.movePercentage = 0.3+Math.random()*0.6;
	}
}
//gets a list of all potential moves
BotController.prototype.getData = function() 
{
	this.availableMoves = []; //get all available moves for the AI
	for (let n1 in this.occupiedNodes) 
	{
		let originNode = this.occupiedNodes[n1]; let availableTargets;
		if (originNode.nodeType == "portal" && originNode.team == this.team)
			availableTargets = gameMap.getAllInRange(originNode.pos,MAX_RANGE*5);
		else
			availableTargets = gameMap.getAllInRange(originNode.pos,MAX_RANGE);
		for (let n2 in availableTargets) 
		{
			let targetNode = availableTargets[n2];
			if (originNode != targetNode)
			this.availableMoves.push({origin:originNode,target:targetNode,value:0});
		}
	}
}
//assign values to potential moves
BotController.prototype.assignValues = function() 
{
	for (let m in this.availableMoves) 
	{
		let move = this.availableMoves[m];
		let origin = move.origin, target = move.target;
		let originOwner = this.getOwner(origin); //1 for this control, -1 for enemy control, 0 for neutral control
		let targetOwner = this.getOwner(target); //1 for this control, -1 for enemy control, 0 for neutral control
		let originUnits = 2*origin.getUnitsOfTeam(this.team)-origin.getTotalUnits(); //positive if friendlies outnumber enemies, negative otherwise
		let targetUnits = 2*target.getUnitsOfTeam(this.team)-target.getTotalUnits(); //positive if friendles outnumber enemies, negative otherwise
		//analyze the target
		if (target.nodeType == "core") //cores cannot be selected
		{
			move.value = -9999;
		}
		if (targetOwner == 1) //target is allied
		{
			if (targetUnits <= -5 && originUnits*this.movePercentage > -targetUnits) //target ally is under attack
				move.value += (2+target.level+target.getTotalUnits()/10)*this.defenseWeight; //high-value move
		}
		if (targetOwner == 0) //target is neutral
		{
			if (originUnits*this.movePercentage > -targetUnits+10)
				move.value += (2+target.level+target.getTotalUnits()/10)*this.expansionWeight; //target can be captured
			else 
				move.value -= 5; //if the target is strong enough to resist the attack, avoid this move
		}
		if (targetOwner == -1) //target is enemy
		{
			if (originUnits*this.movePercentage > -targetUnits+10 || Math.random() < this.attackWeight/200)
				move.value += (2+target.level+target.getTotalUnits()/10)*this.attackWeight; //target is vulnerable to attack
			else 
				move.value -= 5; //if the target is strong enough to resist the attack, avoid this move
		}
		//analyze the origin
		if (originOwner == 1) //origin is allied 
		{
			if (originUnits != origin.getTotalUnits()) //defensive action on this node, hold position
				move.value -= 5;
			else if (origin.getTotalUnits() >= MAX_UNITS) //avoid sitting on max units
				move.value += 5;
		}
		if (originOwner == 0) //target is neutral
		{
			move.value -= 2*origin.level*this.expansionWeight; //avoid moving units off of neutral nodes
		}
		if (originOwner == -1) //target is enemy
		{
			if (originUnits <= -10) //units are being overwhelmed
				move.value += this.defenseWeight; //high-value move to evacuate
			else 
				move.value -= 3*origin.level*this.attackWeight; //avoid removing units from a moderately effective attack
		}
	}
}

//controller object for an online player
PlayerController.prototype = new Controller();
PlayerController.prototype.constructor = PlayerController;
function PlayerController(team,client) 
{
	Controller.call(this,team);
	this.client = client //connection data for this client
	this.packets = []; //data packets to send to the client
	//set up to transfer data to the client
	this.transferAllData() //send all data to allow client to load the map
	setInterval(function(_this){_this.sendPackets();},10,this); //send packet set to the client
	//set up to receive data from the client
	this.client.player = this
	this.client.on('spawn', function(data) //the client is requesting to spawn in
	{
		console.log("Spawning New Player " + data)
		this.player.spawn(data)
	});
	this.client.on('move', function(data) //the client is sending a move order
	{
		this.player.move(data)
	});
	this.client.on('disconnect', function(data) //client has disconnected
	{
		this.player.disconnect(data)
	});
}
//transfer all map data to the client
PlayerController.prototype.transferAllData = function()
{
	//transmit teams
	let teamData = []
	for (let t in teams) //avoid transmitting the controller object due to circular reference with client object
	{
		let team = teams[t]
		if (team == undefined)
			teamData.push(undefined)
		else
			teamData.push({index:t,color:team.color,name:team.name})
	}
	this.client.emit("teams",teamData)
	//transmit all nodes
	this.client.emit("map",gameMap.allObjects)
	//transmit moving units
	this.client.emit("groups",movingUnits)
}
//send information packets to the client
PlayerController.prototype.sendPackets = function()
{
	this.client.emit("data",this.packets)
	this.packets = []
	//this.client.emit("groups",movingUnits)
}
PlayerController.prototype.sendPacket = function(packet)
{
	let packetObject = [packet]
	this.client.emit("data",packetObject)
}
//initiate the spawning process
PlayerController.prototype.spawn = function(name)
{
	if (this.team != 0) //don't spawn a new player if we have already spawned in
	{
		console.log("Haxxor attempting to spawn in multiple times!");
		return;
	}
	if (name.length > 20) //cap names at 20 chars
	{
		console.log("Someone's made a really long name!");
		name = name.substring(0,20);
	}
	let spawnPoint = gameController.spawnNewPlayer(this,name);
	this.client.emit("spawnsuccess",{team:this.team,spawnPoint:spawnPoint});
	//move into the players group
	players.push(this)
}
//transmit a move order
PlayerController.prototype.move = function(data)
{
	//get the start node and end node
	let startNode = getObjectById(data.startNode)
	let endNode = getObjectById(data.endNode)
	//verify that data is correct
	if (startNode == undefined || endNode == undefined)
	{
		console.log("Invalid Move Packet Detected")
		return;
	}
	//transmit the move order
	this.addMoveOrder(startNode,endNode,data.unitsTransferred,data.time)
}
//handle player disconnect
PlayerController.prototype.disconnect = function(data)
{
	if (teams[this.team] != undefined)
		console.log("Player " + teams[this.team].name + " (" + this.team + ")" + " has disconnected")
	else
		console.log("A spectator has disconnected")
	for (let n = movingUnits.length-1; n >= 0; n--) //kill moving units
	{
		let group = movingUnits[n]
		if (group.team == this.team)
		{
			addPacket({type:"groupLoss",id:group.id,number:group.number}) //send deletion to client
			movingUnits.splice(n,1) //delete the moving group
		}
	}
	//revert all of this team's nodes and units to neutral
	for (let n = this.occupiedNodes.length-1; n >= 0; n--)
	{
		let node = this.occupiedNodes[n]
		let units = node.getUnitsOfTeam(this.team)
		if (units > 0) //transform all units to neutral units
		{
			node.addUnits(this.team,-units,true)
			node.addUnits(0,units)
		}
		if (node.team == this.team)
			node.changeTeam(0)
		else if (node.captureTeam == this.team)
		{
			node.captureTeam = undefined; node.capturePoints = 0;
			addPacket({type:"assault",node:node.id,points:node.capturePoints,team:node.captureTeam})
		}
	}
	//remove from players and clients group
	for (let n in players)
	{
		if (players[n] == this)
		{
			players.splice(n,1);
			break;
		}
	}	
	for (let n in clients)
	{
		if (clients[n] == this)
		{
			clients.splice(n,1);
			break;
		}
	}
}

///ID generation
var lastID = 0;
function generateNodeID()
{
	lastID++;
	return lastID;
}
function generateMovingGroupID()
{
	lastID++;
	return lastID;
}

//returns the object with the given ID, or undefined if none is present
function getObjectById(id) 
{
	for (let n in gameMap.allObjects)
	{
		let object = gameMap.allObjects[n]
		if (id == object.id)
			return object;
	}
	return undefined
}

///netcode elements
var express = require('express');  
var app = express();  
var server = require('http').createServer(app);  
var io = require('socket.io')(server);
// serve index.html to client
app.use(express.static(__dirname + '/node_modules'));  
app.get('/', function(req, res,next) {  
    res.sendFile(__dirname + '/index.html');
});
//serve requested files to the client
app.get('/:filename', function(req , res){
	res.sendFile(__dirname+"/"+req.params.filename);
});
/*
//serve client script to client
app.get('/Spheres.js', function(req, res,next) {  
    res.sendFile(__dirname + '/Spheres.js');
});
//server constants to client
app.get('/consts.js', function(req, res,next) {  
    res.sendFile(__dirname + '/consts.js');
});
//send favicon to client
app.get('/favicon.ico', function(req, res,next) {
    res.sendFile(__dirname + '/favicon.ico');
});
*/
//netcode?
io.on('connection', function(client) 
{  
    console.log('Client connected...');
    // detect client ping
	client.on('join', function(data) 
	{
		if (players.length > MAX_PLAYERS) //don't allow players to join past max capacity
		{
			console.log(players.length);
			console.log("Server maximum capacity reached");
			client.emit("data",[{type:"disconnectMessage",message:"The server is over capacity"}]);
			client.disconnect();
			return;
		}
        //console.log(client);
		//create a new player controller
		clients.push(new PlayerController(0,client))
		//client.emit("teams",teams)
		//client.emit("map",gameMap.allObjects)
	});
    //distribute messages back to client
})
//load up the server
initialize();
server.listen(80)

//adds the given data packet to all player objects
function addPacket(data)
{
	for (let p in clients)
	{
		clients[p].packets.push(data)
		//players[p].sendPacket(data)
	}
}