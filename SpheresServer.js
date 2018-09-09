"use strict"
//spheres IO server code
//global variables
require("./consts.js")(global)
var gameBoard; var graphics; var leaderBoard; //controller objects
//var canvas = document.getElementById("viewport"); //the canvas used for the main board
//var draw = canvas.getContext("2d"); //the drawing context used for draw actions
var gameMap = new GameMap(); //an array of all nodes
var movingUnits = []; //an array of all MovingUnit groups
var teams = {}; //a list of all teams
var players = []; //lists the playerController for all non-bot players
//event listener
//var player;
//initialization block
var initialize = function() 
{
	console.log("beginning game");
	//document.getElementById("title").style.visibility = "hidden";
	gameBoard = new GameController();
	//graphics = new ViewPort(0,0,window.innerWidth,window.innerHeight);
	//player = new PlayerController(undefined);
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
	setInterval(gameTick,100); //ticks game updates
	//occasionally spawn in new bots
	//setInterval(function(_this){_this.spawnNewPlayer(new BotController(teams.length),"Bot")},60000,this);
}
//generates a map
GameController.prototype.generateMap = function(height,width) 
{
	//start with special nodes
	/*
	let centerNode = new FactoryNode(new Position(width/2,height/2));
	centerNode.addUnits(centerNode.team,100);
	gameMap.addObject(centerNode);
	*/
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
		this.spawnNewPlayer(new BotController(teams.length),"Bot");
		t++;
	}
}
//attempts to place a node
GameController.prototype.placeNode = function(tempNode)
{
	let isClear = true;
	let potentialObstructions = gameMap.checkAllInRange(tempNode.pos,250);
	for (let n in potentialObstructions) 
	{
		if (Position.getDistance(tempNode.pos,potentialObstructions[n].pos) <= (tempNode.size+potentialObstructions[n].size)*2+30)
			isClear = false;
	}
	//push the node
	if (isClear)
	{
		tempNode.addUnits(tempNode.team,10+Math.floor(Math.random()*40));
		gameMap.addObject(tempNode);
		return true;
	}
	else
	{
		return false;
	}
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
		else if (counter > 10000) //force a spawn over a player's node
		{
			console.log("No neutral nodes, forced to overspawn player")
			isValidLocationFound = true;
			node.units = [];
			node.changeTeam(teamIndex);
			node.addUnits(teamIndex,100);
		}
	}
	return node;
}
//triggers secondary timers
function gameTick()
{
	for (let index in gameMap.allObjects)
	{
		let node = gameMap.allObjects[index];
		
		//if a node has more than one team of units on it, start a battle
		if (node.units.length > 1 && node.fighting == false) 
		{
			node.fight(node.units);
		}
		//if a node is under control by units from a different team than its own team, capture it
		if (node.units.length == 1 && node.capturing == false && (node.units[0].team != node.team || node.capturePoints > 0)) 
		{
			node.capture();
		}
		//if a node is non-neutral, attempt to spawn
		if (node.team != 0 && (node.getUnitsOfTeam(node.team).number != 0 || node.units.length == 0) && node.spawning == false)
		{
			node.spawn();
		}
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
//range-checking
GameMap.prototype.checkAllInRange = function(pos,range) 
{
	let radius = Math.ceil(range/HASH_SIZE);
	let x = Math.floor(pos.x/HASH_SIZE);
	let y = Math.floor(pos.y/HASH_SIZE);
	let output = [];
	let checkedNodes = 0;
	let validNodes = 0;
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
				checkedNodes++;
				if (Position.getDistance(pos,pos2.pos) <= range)
				{
					validNodes++;
					output.push(pos2);
				}
			}
			}
		}
	}
	return output;
}
//draws the grid
/*
GameMap.prototype.drawGrid = function() 
{
	draw.strokeStyle = "rgb(200,200,200)";
	draw.lineWidth = 2;
	for (let x = 0; x < this.size; x++)
	{
		for (let y = 0; y < this.size; y++)
		{
			draw.strokeRect(x*HASH_SIZE-graphics.x,y*HASH_SIZE-graphics.y,HASH_SIZE,HASH_SIZE);
		}
	}
}
*/
//}

//class for nodes
function Node(position,level) 
{
	this.id = generateNodeID(); //unique ID of this node
	this.pos = position; //position of the node
	this.level = level; //level of the node, influences capture speed and unit production
	this.size = (20+10*level)*SIZE_SCALE; //size of the node is based on level
	this.team = 0; //nodes are created neutral by default
	this.units = []; //a listing of all unit groups that are on this node
	this.selected = false; //whether the user has selected this node
	this.fighting = false; //whether or not the node is fighting
	this.capturing = false; //whether or not the node is being captured
	this.spawning = false; //whether or not the node is spawning units
	this.capturePoints = 0; //percentage of base that was captured
	this.captureTeam = undefined; //the team that is capturing the node (undefined if no team is capturing)
}
//gets the unit group for all units of the particular team
Node.prototype.getUnitsOfTeam = function(team)
{
	for (let index in this.units) 
	{
		let group = this.units[index];
		if (group.team == team)
			return group;
	}
	//if no group is found, return 0
	return new Units(team,0);
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
				{
					console.log("Negative units detected")
				}
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
//spawns a unit at this node if conditions are right 
Node.prototype.spawn = function() 
{
	this.spawning = true;
	let delay = (SPAWN_TIME*1000)/this.level;
	delay *= 1+teams[this.team].controller.getTotalUnits()/UNITS_PER_SPAWN_MULTIPLIER;
	if (this.fighting) delay *= FIGHT_SPAWN_MULTIPLIER; //units take twice as long to spawn while in combat
	if (!teams[this.team].controller.isCapacityReached() && (this.getUnitsOfTeam(this.team).number != 0 || this.units.length == 0)) 
	{
		this.addUnits(this.team,1);
		setTimeout(function(_this){_this.spawn();},delay,this);
	}
	else 
	{
		setTimeout(function(_this){_this.spawning = false;},delay,this);
	}
}
//capturing function
Node.prototype.capture = function() 
{
	if (this.units.length != 1) //if team is undefined, do not capture
	{
		this.capturing = false;
		return;
	}
	if (this.captureTeam != undefined && this.units[0].team != this.captureTeam) //if another team arrives, they drain the capture points
	{
		if (this.capturePoints <= 0)
		{
			this.capturePoints = 0; //set capture points to zero to prevent a drawing error
			this.capturing == false;
			this.captureTeam = undefined;
		}
		else 
		{
			this.capturePoints -= 2; //recaptures at twice the rate
		}
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
			this.capturing = true; //still capturing to turn it to team's control
		}
		else
		{
			this.changeTeam(this.units[0].team);
			this.capturing = false;
		}
		this.captureTeam = undefined;
		this.capturePoints = 0;
	}
	else 
	{
		//if the units have left the node, stop capturing
		if (this.units[0].number == 0) 
		{
			this.capturePoints = 0;
			this.capturing = false;
		}
		else 
		{
			this.capturePoints++;
			this.capturing = true;
		}
	}
	if (this.capturing)
	{
		let delay = (CAPTURE_TIME*100*this.level)/this.units[0].number;
		setTimeout(function(_this){_this.capture();},delay,this);
	}
	addPacket({type:"assault",node:this.id,points:this.capturePoints,team:this.captureTeam})
}
//method to properly change the team of a node
Node.prototype.changeTeam = function(newTeam) 
{
	if (this.team != 0) 
	{teams[this.team].controller.removeOccupiedNode(this);} //team 0 does not have a controller
	this.team = newTeam;
	if (this.team != 0) 
	{teams[this.team].controller.addOccupiedNode(this);} //team 0 does not have a controller
	addPacket({type:"capture",node:this.id,team:newTeam})
}
//combat mechanics system (ported from BattleFunction program)
Node.prototype.fight = function()
{
	//add the numbers of all teams to a total number
	let unitNums = this.units;
	var totalUnits = 0;
	for(let x = 0; x < unitNums.length; x++)
	{
		totalUnits = +totalUnits + +unitNums[x].number;
	}
	//choose a random unit out of all units to attack
	var attackerLocation = Math.floor(Math.random()*totalUnits)+1;
	var attackerFound = false;
	var index = 0;
	while (!attackerFound)
	{
		if (unitNums[index] == undefined)
		{
			console.log("Error detected: invalid unitNums[index]")
			console.log(unitNums)
			console.log(index)
			this.fighting = false
			break;
		}
		attackerLocation -= unitNums[index].number //subtract the unitnums from this
		if (attackerLocation <= 0) //if this is <= 0, the attacker is in the current index
		{
			attackerFound = true;
		}
		else
		{
			index++;
		}
	}
	for(let x = 0; x < unitNums.length; x++) //every array that is not the attacker loses 1 unit
	{
		if (x != index)
		{
			this.addUnits(unitNums[x].team,-1,true)
		}
	}
	//continue fighting if a fight is still needed 
	if (unitNums.length > 1)
	{
		let delay = Math.min((FIGHT_TIME*10000)/(totalUnits),FIGHT_TIME*1000);
		setTimeout(function(_this){_this.fight();},delay,this);
		this.fighting = true;
	}
	else 
	{
		this.fighting = false;
	}
	return unitNums; //returns unitNums if needed
}
//special node type: factory, high production unless fighting
FactoryNode.prototype = new Node();
FactoryNode.prototype.constructor = FactoryNode;
function FactoryNode(position)
{
	Node.call(this,position,10);
	this.size = 150*SIZE_SCALE;
	this.nodeType = "factory";
}
FactoryNode.prototype.spawn = function() //factory nodes do not spawn if in combat
{
	if(!this.fighting)
		Node.prototype.spawn.call(this)
	else
		this.spawning = false;
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
}
//portals do not spawn
PortalNode.prototype.spawn = function()
{
	return;
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
	this.direction = Position.getDirection(this.startNode.pos,this.endNode.pos);	
	this.remainingDistance = Position.getDistance(this.startNode.pos,this.endNode.pos);
	this.lastMoveTime = new Date(); //time when the last move order was executed, should be at most 17 without any lag
}
//moves the group towards its destination
MovingGroup.prototype.move = function(dis) 
{
	//if there are 0 units on this node, destroy it
	if (this.number <= 0)
	{
		return "destroyed"
	}
	let currentTime = new Date();
	let distance = MOVE_SPEED*(currentTime-this.lastMoveTime)/1000
	this.lastMoveTime = currentTime
	this.pos.x += distance*Math.cos(this.direction);
	this.pos.y += distance*Math.sin(this.direction);
	this.remainingDistance -= distance;
	//if close to the other node, add this group's units to that node
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
	else 
	{
		this.checkForAttrition()
	}
}
//checks for attrition
MovingGroup.prototype.checkForAttrition = function()
{
	if (teams[this.team] == undefined)
	{console.log("Invalid Moving Group Team"); console.log(this.number); return;}
	let friendlyNodes = teams[this.team].controller.occupiedNodes
	let nearFriendly = false;
	for (let n in friendlyNodes)
	{
		let node = friendlyNodes[n]
		if (this.team == node.team && Position.getDistance(this.pos,node.pos) < CONTROL_RANGE)
		{
			nearFriendly = true;
		}
	}
	let atritNumber = this.number
	if (nearFriendly)
	{
		atritNumber -= MAX_UNITS_IN_GROUP
	}
	if (atritNumber > 0) //trigger attrition
	{
		//note: formula is currently inaccurate
		//percentage of attrition per tick: (MOVE_SPEED/50)/ATRIT_RATE
		let atritChance = (MOVE_SPEED/50)/ATRIT_RATE;
		let losses = 0;
		for (let x = 0; x < atritNumber; x++)
		{
			if (Math.random() < atritChance)
			{
				losses++;
			}
		}
		if (losses > 0)
		{
			this.number -= losses;
			addPacket({type:"groupLoss",id:this.id,number:losses})
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
	if (result == 0) 
	{
		console.log("invalid direction");
	}
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
		if (red+green+blue >= 50) //color must be bright enough
		{
			isColorValid = true;
		}
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
	for (let p in players)
	{
		players[p].client.emit("leaderboard",leaderData)
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
	this.team = team; //ID of this controller's team
	this.unitCapacity = 0; //this team's unit capacity
}
//creates a moving group between the target node and the other node
Controller.prototype.moveUnits = function(startNode,endNode,unitsTransferred)
{
	if (unitsTransferred != 0/* && Position.getDistance(startNode.pos,endNode.pos) <= MAX_RANGE */&& startNode != endNode) //extra checking of conditions
	{
		startNode.addUnits(this.team,-unitsTransferred);
		if (startNode.nodeType == "portal" && startNode.team == this.team)
		{
			endNode.addUnits(this.team,unitsTransferred);
			return;
		}
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
	this.calculateUnitCapacity();
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
				delete teams[this.team]
				addPacket({type:"removeTeam",index:this.team})
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
	this.unitCapacity = 10*UNITS_PER_LEVEL; //start at base capacity
	for (let n in this.occupiedNodes) //add capacity for each owned node
	{
		let node = this.occupiedNodes[n];
		if (this.getOwner(node) == 1 && node.nodeType == undefined)
			this.unitCapacity += node.level*UNITS_PER_LEVEL;
	}
	return this.unitCapacity;
}
//sums up all units in all nodes
Controller.prototype.getTotalUnits = function() 
{
	let totalUnits = 0;
	for (let n in this.occupiedNodes) 
	{
		totalUnits += this.occupiedNodes[n].getUnitsOfTeam(this.team).number;
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
	if (Math.random() <= this.reaction && this.occupiedNodes.length != 0) 
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
			this.moveUnits(chosenMove.origin,chosenMove.target,Math.floor(chosenMove.origin.getUnitsOfTeam(this.team).number*this.movePercentage));
		//occasionally change the move percentage
		if (Math.random() < 0.1)
			this.movePercentage = 0.3+Math.random()*0.6;
	}
}
//gets data
BotController.prototype.getData = function() 
{
	this.availableMoves = []; //get all available moves for the AI
	for (let n1 in this.occupiedNodes) 
	{
		let originNode = this.occupiedNodes[n1]; let availableTargets;
		if (originNode.nodeType == "portal")
			availableTargets = gameMap.allObjects;
		else
			availableTargets = gameMap.checkAllInRange(originNode.pos,MAX_RANGE);
		for (let n2 in availableTargets) 
		{
			let targetNode = availableTargets[n2];
			if (originNode != targetNode)
			this.availableMoves.push({origin:originNode,target:targetNode,value:0});
		}
	}
}
//assign values
BotController.prototype.assignValues = function() 
{
	for (let m in this.availableMoves) 
	{
		let move = this.availableMoves[m];
		let origin = move.origin, target = move.target;
		let originOwner = this.getOwner(origin); //1 for this control, -1 for enemy control, 0 for neutral control
		let targetOwner = this.getOwner(target); //1 for this control, -1 for enemy control, 0 for neutral control
		let originUnits = 2*origin.getUnitsOfTeam(this.team).number-origin.getTotalUnits(); //positive if friendlies outnumber enemies, negative otherwise
		let targetUnits = 2*target.getUnitsOfTeam(this.team).number-target.getTotalUnits(); //positive if friendles outnumber enemies, negative otherwise
		//analyze the target
		if (targetOwner == 1) //target is allied
		{
			if (targetUnits <= -5 && originUnits*this.movePercentage > -targetUnits) //target ally is under attack
			{
				move.value += (2+target.level+target.getTotalUnits()/10)*this.defenseWeight; //high-value move
			}
		}
		if (targetOwner == 0) //target is neutral
		{
			if (originUnits*this.movePercentage > -targetUnits+10)
			{
				move.value += (2+target.level+target.getTotalUnits()/10)*this.expansionWeight; //target can be captured
			}
			else 
			{
				move.value -= 5; //if the target is strong enough to resist the attack, avoid this move
			}
		}
		if (targetOwner == -1) //target is enemy
		{
			if (originUnits*this.movePercentage > -targetUnits+10 || Math.random() < this.attackWeight/200)
			{
				move.value += (2+target.level+target.getTotalUnits()/10)*this.attackWeight; //target is vulnerable to attack
			}
			else 
			{
				move.value -= 5; //if the target is strong enough to resist the attack, avoid this move
			}
		}
		//analyze the origin
		if (originOwner == 1) //origin is allied 
		{
			if (originUnits != origin.getTotalUnits()) //defensive action on this node, hold position
			{
				move.value -= 5;
			}
			if (targetOwner == 1 && target.nodeType == "portal") //send forces to portals to prepare attacks
			{
				move.value += 1;
			}
		}
		if (originOwner == 0) //target is neutral
		{
			move.value -= 2*origin.level*this.expansionWeight; //avoid moving units off of neutral nodes
		}
		if (originOwner == -1) //target is enemy
		{
			if (originUnits <= -10) //units are being overwhelmed
			{
				move.value += this.defenseWeight; //high-value move to evacuate
			}
			else 
			{
				move.value -= 3*origin.level*this.attackWeight; //avoid removing units from a moderately effective attack
			}
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
		console.log("Spawning New Player")
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
	//this.team = teams.length;
	let spawnPoint = gameBoard.spawnNewPlayer(this,name);
	this.client.emit("spawnsuccess",{team:this.team,spawnPoint:spawnPoint})
}
//transmit a move order
PlayerController.prototype.move = function(data)
{
	//get the node and othernode
	let otherNode = getObjectById(data.otherNode)
	let node = getObjectById(data.node)
	//verify that data is correct
	if (otherNode == undefined || node == undefined)
	{
		console.log("Invalid Move Packet Detected")
		return;
	}
	//transmit the move order
	this.moveUnits(otherNode,node,data.unitsTransferred)
}
//handle player disconnect
PlayerController.prototype.disconnect = function(data)
{
	if (teams[this.team] != undefined)
		console.log("Player " + teams[this.team].name + " (" + this.team + ")" + " has disconnected")
	else
		console.log("Player " + " (" + this.team + ")" + " has disconnected")
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
		let units = node.getUnitsOfTeam(this.team).number
		if (units > 0) //transform all units to
		{
			node.addUnits(this.team,-units,true)
			node.addUnits(0,units)
		}
		if (node.team == this.team)
			node.changeTeam(0)
	}
	//delete players[this.team]
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
//serve client script to client
app.get('/Spheres.js', function(req, res,next) {  
    res.sendFile(__dirname + '/Spheres.js');
});
//server constants to client
app.get('/consts.js', function(req, res,next) {  
    res.sendFile(__dirname + '/consts.js');
});

//netcode?
io.on('connection', function(client) 
{  
    console.log('Client connected...');
    // detect client ping
	client.on('join', function(data) 
	{
        //console.log(client);
		//create a new player controller
		players.push(new PlayerController(0,client))
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
	for (let p in players)
	{
		players[p].packets.push(data)
		//players[p].sendPacket(data)
	}
}