"use strict"
//singleplayer pulse.io code
//global variables
//{ CONSTANTS
	var CAPTURE_TIME = 3; //number of seconds it takes 10 units to capture a level 1 node
	var SPAWN_TIME = 5; //number of seconds it takes for a level 1 node to spawn a unit
	var UNITS_PER_LEVEL = 5; //population capacity granted for each level
	var FIGHT_TIME = 0.8; //amount of time between each round of fight with 10 units
	var FIGHT_SPAWN_MULTIPLIER = 2; //multiplier to spawning times while a node is in combat
	var MOVE_SPEED = 500; //number of pixels moved in a second
	var MAP_SIZE = 10000 //height and width of the map
	var MIN_NODES_TO_GENERATE = 500; //minimum amount of nodes generated
	var MAX_NODES_TO_GENERATE = 750; //maximum amount of nodes generated
	var TEAMS_TO_GENERATE = 5; //amount of AI teams to generate at the start of the game
	var MAX_RANGE = 1000; //maximum range of a movingUnit group
	var HASH_SIZE = MAX_RANGE/2; //size of each hash grid
	var fontSize = 16; //base font size
//}
var gameBoard; var graphics; var leaderBoard; //controller objects
var canvas = document.getElementById("viewport"); //the canvas used for the main board
var draw = canvas.getContext("2d"); //the drawing context used for draw actions
var gameMap = new GameMap(); //an array of all nodes
var movingUnits = []; //an array of all MovingUnit groups
var teams = []; //a list of all teams
var playerNameIndex = undefined; //the index of the player's team
//event listener
var player;
//initialization block
var initialize = function() 
{
	console.log("beginning game");
	document.getElementById("title").style.visibility = "hidden";
	gameBoard = new GameController();
	graphics = new ViewPort(0,0,window.innerWidth,window.innerHeight);
	player = new PlayerController(undefined);
	leaderBoard = new LeaderBoard();
}

//{ backbone game logic objects
///logic system
//**********
function GameController()
{
	teams.push(new Team("rgb(128,128,128)",new Controller())); //neutral team
	this.generateMap(MAP_SIZE,MAP_SIZE);
	setInterval(gameTick,100); //ticks game updates
	//occasionally spawn in new bots
	setInterval(function(_this){_this.spawnNewPlayer(new BotController(teams.length),"Bot " + teams.length)},60000,this);
}
//generates a map
GameController.prototype.generateMap = function(height,width) 
{
	let n = 0; let generatedNodes = MIN_NODES_TO_GENERATE+Math.floor(Math.random()*(MAX_NODES_TO_GENERATE-MIN_NODES_TO_GENERATE));
	//adds nodes only where there is empty space available;
	while (n < generatedNodes) 
	{
		let tempNode = new Node(new Position(Math.random()*height,Math.random()*width),1+Math.floor(Math.random()*10));
		//determine if there is sufficient space between this node and all other nodes
		let isClear = true;
		let potentialObstructions = gameMap.checkAllInRange(tempNode.pos,250);
		for (let n in potentialObstructions) 
		{
			if (Position.getDistance(tempNode.pos,potentialObstructions[n].pos) <= (tempNode.size+potentialObstructions[n].size)*2)
				isClear = false;
		}
		//push the node
		if (isClear)
		{
			tempNode.addUnits(tempNode.team,Math.floor(Math.random()*20));
			gameMap.addObject(tempNode);
			n++;
		}
	}
	//spawns teams to populate the map with AI bots
	let t = 1;
	while (t <= TEAMS_TO_GENERATE) 
	{
		this.spawnNewPlayer(new BotController(teams.length),"Bot " + teams.length);
		t++;
	}
}
//spawns in a new player
GameController.prototype.spawnNewPlayer = function(controller,name)
{
	let teamIndex = teams.length;
	let team = new Team(generateRandomColor(),controller,name);
	teams.push(team);
	let isValidLocationFound = false;
	let node;
	while (!isValidLocationFound) 
	{
		let index = Math.floor(Math.random()*gameMap.allObjects.length);
		node = gameMap.allObjects[index];
		if (node.team == 0) 
		{
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
//}

//{ game objects
//class for nodes
function Node(position,level) 
{
	this.pos = position; //position of the node
	this.level = level; //level of the node, influences capture speed and unit production
	this.size = 25+5*level; //size of the node is based on level
	this.team = 0; //nodes are created neutral by default
	this.units = []; //a listing of all unit groups that are on this node
	this.selected = false; //whether the user has selected this node
	this.fighting = false; //whether or not the node is fighting
	this.capturing = false; //whether or not the node is being captured
	this.spawning = false; //whether or not the node is spawning units
	this.capturePoints = 0; //percentage of base that was captured
	this.captureTeam = undefined; //the team that is capturing the node (undefined if no team is capturing)
}
//draws the node
Node.prototype.drawObject = function(viewport) 
{
	//draw the main node
	draw.fillStyle = teams[this.team].color;
	draw.beginPath();
	draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size,0,2*Math.PI,false);
	draw.fill();
	//draw all units in orbit around the center of the node, and draw numbers to show the amounts
	let numAngle = 0;
	for (let index = 0; index < this.units.length; index++)
	{
		let group = this.units[index];
		group.updateUnitMap();
		draw.fillStyle = teams[group.team].color;
		if (graphics.zoomLevel < 2.5) //do not draw at high zoom level
		{
			for (let index = 0; index < group.unitMap.length; index += 1) 
			{
				let unitPos = group.unitMap[index];
				let unitx = this.pos.x-viewport.x+(Math.cos(unitPos.angle)*this.size*unitPos.distance);
				let unity = this.pos.y-viewport.y+(Math.sin(unitPos.angle)*this.size*unitPos.distance);
				draw.fillRect(unitx-2,unity-2,4,4);
			}
		}
		let textDistance = this.size*2;
		draw.fillText(group.number,
		this.pos.x-viewport.x-(fontSize/2)+(textDistance*Math.cos(numAngle)),
		this.pos.y-viewport.y+(fontSize/4)+(textDistance*Math.sin(numAngle))
		);
		numAngle += (2*Math.PI)/this.units.length;
	}

	//if the node is selected, draw a circle around it
	if (this.selected)
	{
	draw.strokeStyle = "rgba(128,128,128,.5)";
	draw.lineWidth = 3;
	draw.beginPath();
	draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size*1.5,0,2*Math.PI,false);
	draw.stroke();
	//show the maximum range
	draw.beginPath();
	draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,MAX_RANGE,0,2*Math.PI,false);
	draw.stroke();
	}
	//if the node is being captured, draw the capture meter
	if (this.capturePoints != 0) 
	{
		if (this.team != 0) draw.strokeStyle = teams[0].color;
		else draw.strokeStyle = teams[this.captureTeam].color;
		draw.lineWidth = 4;
		draw.beginPath();
		draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size,0,(2*Math.PI)*(this.capturePoints/100));
		draw.stroke();
	}
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
Node.prototype.addUnits = function(team,number) 
{
	let isAdded = false;
	for (let index in this.units) 
	{
		let group = this.units[index];
		if (group.team == team) 
		{
			group.number += number;
			if (group.number == 0) 
			{
				this.units.splice(index,1);
				if (this.team != group.team) teams[group.team].controller.removeOccupiedNode(this);//delete an index with no units
			}
			isAdded = true;
		}
	}
	if (isAdded == false && number != 0) 
	{
		this.units.push(new Units(team,number));
		teams[team].controller.addOccupiedNode(this);
	}
}
//spawns a unit at this node if conditions are right 
Node.prototype.spawn = function() 
{
	if (!teams[this.team].controller.isCapacityReached() && (this.getUnitsOfTeam(this.team).number != 0 || this.units.length == 0)) 
	{
		this.addUnits(this.team,1);
		this.spawning = true;
		let delay = (SPAWN_TIME*1000)/this.level;
		if (this.fighting) delay *= FIGHT_SPAWN_MULTIPLIER; //units take twice as long to spawn while in combat
		setTimeout(function(_this){_this.spawn();},delay,this);
	}
	else 
	{
		this.spawning = false;
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
}
//method to properly change the team of a node
Node.prototype.changeTeam = function(newTeam) 
{
	if (this.team != 0) {} //team 0 does not have a controller
	teams[this.team].controller.removeOccupiedNode(this);
	this.team = newTeam;
	if (newTeam != 0) {} //team 0 does not have a controller
	teams[this.team].controller.addOccupiedNode(this);
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
			unitNums[x].number--;
			//if index is zero, remove it
			if (unitNums[x].number <= 0) 
			{
				teams[unitNums[x].team].controller.removeOccupiedNode(this);
				unitNums.splice(x,1);
			}
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
//an object for a moving group of units
//**********
function MovingGroup(team,number,startNode,endNode) 
{
	this.team = team;
	this.number = number;
	this.startNode = startNode;
	this.endNode = endNode;
	this.pos = new Position(startNode.pos.x,startNode.pos.y);
	this.direction = Position.getDirection(this.startNode.pos,this.endNode.pos);
	//this.move(this.startNode.size); //start moving when spawned
	setTimeout(function(_this){_this.move(_this.startNode.size);},250,this);
}
MovingGroup.prototype.drawObject = function(viewport) 
{
	//draws a cloud of units
	draw.fillStyle = teams[this.team].color;
	for (let unitindex = 0; unitindex < this.number; unitindex += 1) 
	{
		let angle = Math.random()*2*Math.PI;
		let distance = (16)*(1+Math.random());
		let unitx = this.pos.x-viewport.x+(Math.cos(angle)*distance);
		let unity = this.pos.y-viewport.y+(Math.sin(angle)*distance);			
		draw.fillRect(unitx-2,unity-2,4,4);
	}
	draw.fillText(this.number,this.pos.x-viewport.x-fontSize/2,this.pos.y-viewport.y+fontSize/4);
}
//moves the group towards its destination
MovingGroup.prototype.move = function(dis) 
{
	this.pos.x += dis*Math.cos(this.direction);
	this.pos.y += dis*Math.sin(this.direction);
	//if close to the other node, add this group's units to that node
	if (Position.getDistance(this.pos,this.endNode.pos) <= this.endNode.size) 
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
		//set a timer for the next move
		setTimeout(function(_this){_this.move(MOVE_SPEED/50);},20,this);
	}
}
//a simple position object, used for certain inherited methods
//**********
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
	this.unitMap = []; //a map of the angle and direction of all units for the graphics system to draw
	this.addUnits(this.number);
}
//updates the unit map
Units.prototype.updateUnitMap = function() 
{
	let difference = this.number-this.unitMap.length;
	//if number is larger than unitMap, delete some entries
	if (difference < 0) 
	{
		this.unitMap.splice(0,-difference);
	}
	//if number is larger than unitMap, add some entries
	else 
	{
		this.addUnits(difference);
	}
	//rotate all units
	for (let index in this.unitMap) 
	{
		let unit = this.unitMap[index];
		unit.angle += Math.random()*5 * (Math.PI / 180);
	}
}
Units.prototype.addUnits = function(num) 
{
	for (let x = 0; x < num; x++)
	{
		let angle = Math.random()*2*Math.PI;
		let distance = 1.25+Math.random()*0.5;
		this.unitMap.push({angle:angle,distance:distance});
	}
}
//}

//{ graphics objects
///graphics system
function ViewPort(x,y,width,height)
{
	//note: the width of the canvas according to HTML influences how elements are drawn on it.
	this.x = x;
	this.y = y;
	this.width = width;
	this.height = height;
	this.zoomLevel = 1;
	this.AItargets = [];
	let self = this;
	window.onresize = function(e) {self.handleResize(e);};
	window.onwheel = function(e) {self.zoom(e);};
	setInterval(function(_this){_this.drawAllInside();},20,this);
}
//draws everything inside the viewport (could be optimized)
ViewPort.prototype.drawAllInside = function() 
{
	//set font size
	draw.font = "" + (fontSize) + "px" + " sans-serif";
	//clear screen
	draw.clearRect(0,0,canvas.width,canvas.height);
	//draw the border
	draw.strokeStyle = "rgb(255,255,255)";
	draw.lineWidth = 8;
	draw.strokeRect(0-this.x,0-this.y,MAP_SIZE,MAP_SIZE);
	//draw moving groups
	for (let index in movingUnits) 
	{
		let group = movingUnits[index];
		//only draw if the object is near the viewport
		if (group.pos.x+100 >= this.x && group.pos.y+100 >= this.y && group.pos.x-100 <= this.x+this.width && group.pos.y-100 <= this.y+this.height)
			group.drawObject(this);
	}
	//draw nodes
	for (let index in gameMap.allObjects) 
	{
		let node = gameMap.allObjects[index];
		//only draw if the object is near the viewport
		if (node.pos.x+100 >= this.x && node.pos.y+100 >= this.y && node.pos.x-100 <= this.x+this.width && node.pos.y-100 <= this.y+this.height)
			node.drawObject(this);
	}
	//draw UI (currently just the unit indicator)
	draw.fillStyle = "rgb(255,255,255)";
	draw.lineWidth = 1;
	draw.fillText(player.getTotalUnits() + " / " + player.unitCapacity,this.width/2,30*this.zoomLevel);
}
//changes the viewport when the screen changes
ViewPort.prototype.handleResize = function(e) 
{
	this.x -= (window.innerWidth*this.zoomLevel - this.width)/2;
	this.y -= (window.innerHeight*this.zoomLevel - this.height)/2; //change dimensions to 
	canvas.width = window.innerWidth*this.zoomLevel;
	canvas.height = window.innerHeight*this.zoomLevel;
	this.width = window.innerWidth*this.zoomLevel;
	this.height = window.innerHeight*this.zoomLevel;
}
//zooms the screen in and out
ViewPort.prototype.zoom = function(e) 
{
	let scrollAmount = e.wheelDelta/-120;
	this.zoomLevel += scrollAmount*0.05;
	//put limits on zoom level
	if (this.zoomLevel > 4) this.zoomLevel = 4;
	if (this.zoomLevel < 1) this.zoomLevel = 1;
	fontSize = 16*this.zoomLevel;
	this.handleResize(e); //resizes the screen automatically
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
	let allTeams = teams.slice(1);
	allTeams.sort(function (a,b) //sort by unit capacity (develop a scoring system later?)
	{
		return a.controller.unitCapacity-b.controller.unitCapacity;
	});
	this.top10 = allTeams.slice(0,10);
	this.updateBoard();
	setTimeout(function(_this){_this.getLeaders();},1000,this); //automatically recalculate leaders every 5 seconds
}
//update the leaderboard
LeaderBoard.prototype.updateBoard = function() 
{
	for (let index = 1; index <= 10; index++)
	{
		let element = document.getElementById(index); let team = this.top10[index-1];
		if (team !== undefined)
		{
			element.style.visibility = "visible";
			element.innerHTML = team.name;
			element.style.color = team.color;
		}
		else
		{
			element.style.visibility = "hidden"; //hide excess leaderboard elements
		}
	}
}
//}

//{ player controller objects
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
	this.occupiedNodes = [];
	this.team = team; //ID of this controller's team
	this.unitCapacity = 0;
}
//creates a moving group between the target node and the other node
Controller.prototype.moveUnits = function(startNode,endNode,unitsTransferred)
{
	if (unitsTransferred != 0 && Position.getDistance(startNode.pos,endNode.pos) <= 1000 && startNode != endNode) //extra checking of conditions
	{
		startNode.addUnits(this.team,-unitsTransferred);
		let moveGroup = new MovingGroup(this.team,unitsTransferred,startNode,endNode);
		movingUnits.push(moveGroup);
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
			if (this.occupiedNodes.length == 0) //if the controller has no nodes, it is eliminated
			{
				console.log("Player " + this.team + " has been eliminated")
			}
			return;
		}
	}
	this.calculateUnitCapacity();
}
//calculates unit capacity
Controller.prototype.calculateUnitCapacity = function() 
{
	this.unitCapacity = 0;
	for (let n in this.occupiedNodes) 
	{
		let node = this.occupiedNodes[n];
		if (this.getOwner(node) == 1)
		this.unitCapacity += node.level*UNITS_PER_LEVEL;
	}
	this.unitCapacity = Math.max(this.unitCapacity,10*UNITS_PER_LEVEL);
	return this.unitCapacity;
}
//sums up all units in all nodes (should be using selectedNodes)
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
	this.reaction = 0.05; //chance of the AI acting every AI tick
}
//main AI loop
BotController.prototype.runAI = function() 
{
	//get the available moves for the AI
	this.getData();
	//assign values
	this.assignValues();
	graphics.AItargets = this.availableMoves; //test feature
	if (Math.random() <= this.reaction && this.occupiedNodes.length != 0) 
	{

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
		this.moveUnits(chosenMove.origin,chosenMove.target,Math.floor(chosenMove.origin.getUnitsOfTeam(this.team).number/2));

	}
}
//gets data
BotController.prototype.getData = function() 
{
	this.availableMoves = []; //get all available moves for the AI
	for (let n1 in this.occupiedNodes) 
	{
		let originNode = this.occupiedNodes[n1];
		let availableTargets = gameMap.checkAllInRange(originNode.pos,MAX_RANGE);
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
			if (targetUnits <= -5 && originUnits > -2 * targetUnits) //target ally is under attack
			{
				move.value += (2+target.level+target.getTotalUnits()/10)*this.defenseWeight; //high-value move
			}
		}
		if (targetOwner == 0) //target is neutral
		{
			move.value += target.level * this.expansionWeight; //increase the incentive to capture this node
		}
		if (targetOwner == -1) //target is enemy
		{
			if (originUnits > -2.5 * targetUnits)
			{
				move.value += (2+target.level+target.getTotalUnits()/10)*this.attackWeight; //high-value move
			}
			else 
			{
				move.value -= 5; //if the target is strong enough to resist the attack, avoid this move
			}
		}
		//analyze the origin
		move.value -= Math.max(0,(10*this.defenseWeight-originUnits)); //moves with small numbers of units have lower value
		if (originOwner == 1) //origin is allied 
		{
			
		}
		if (originOwner == 0) //target is neutral
		{
			move.value -= 2*origin.level*this.expansionWeight; //avoid moving units off of neutral nodes
		}
		if (originOwner == -1) //target is enemy
		{
			if (originUnits <= -5) //units are being overwhelmed
			{
				move.value += 10*this.defenseWeight; //high-value move to evacuate
			}
			else 
			{
				move.value -= 3*origin.level*this.attackWeight; //avoid removing units from an active attack
			}
		}
	}
}
///controller object for a team, player user input system
PlayerController.prototype = new Controller();
PlayerController.prototype.constructor = PlayerController;
function PlayerController(team) 
{
	Controller.call(this,team);
	this.selectedNodes = []; //nodes the player has currently selected
	this.newGroups = []; //groups created during the most recent
	this.selecting = false; //whether or not to select nodes the mouse hovers over
	this.dragMode = false; //whether the user is dragging the camera
	this.mousePos; //the current mouse position
	//add control handlers
	let self = this;
	window.onkeydown = function(e) {self.getKeyboardInput(e);};
	canvas.onmousedown = function(e) {self.getMouseDown(e);};
	canvas.onmousemove = function(e) {self.getMouseMove(e);};
	canvas.onmouseup = function(e) {self.getMouseUp(e);};
	canvas.ondblclick = function(e) {self.getDoubleClick(e);};
	canvas.onmouseout = function(e) {self.selecting = false; self.dragMode = false;}; //resets modes if mouse exits game
}
//spawns in the player
PlayerController.prototype.spawn = function(e) 
{
	//pushes out a new color for the player
	this.team = teams.length;
	let spawnPoint = gameBoard.spawnNewPlayer(this);
	let chosenName = document.getElementById("nameBox").value;
	if (chosenName != "")
	teams[this.team].name = chosenName;
	graphics.x = spawnPoint.pos.x-(graphics.width/2);
	graphics.y = spawnPoint.pos.y-(graphics.height/2);
}
//adds a selected node, avoiding duplicates
PlayerController.prototype.addSelectedNode = function(node) 
{
	let isDuplicate = false;
	for (let index in this.selectedNodes) 
	{
		if (node == this.selectedNodes[index])
			isDuplicate = true;
	}
	if (!isDuplicate)
	{
		node.selected = true;
		this.selectedNodes.push(node);
	}
} 
//reads keyboard input
PlayerController.prototype.getKeyboardInput = function(e) 
{
	switch (e.keyCode) 
	{
		case 37: //left
		graphics.x -= 25;;
		break;
		case 38: //up
		graphics.y -= 25;
		break;
		case 39: //right
		graphics.x += 25;
		break;
		case 40: //down
		graphics.y += 25;
		break;
		case 32: //space, selects all occupied nodes?
		if (this.team !== undefined) 
		{
			for (var n in this.occupiedNodes) 
			{
				let node = this.occupiedNodes[n];
				this.selectedNodes.push(node);
				node.selected = true;
			}
		}
		break;
	}
}
PlayerController.prototype.getMouseDown = function(e) 
{
	e.preventDefault();
	this.mousePos = new Position((e.clientX*graphics.zoomLevel)+graphics.x, (e.clientY*graphics.zoomLevel)+graphics.y);
	if (this.team !== undefined)
	{
		//detect the node that is clicked on
		let node = null;
		let potentialSelections = gameMap.checkAllInRange(this.mousePos,250);
		for (let n in potentialSelections) 
		{
			if (Position.getDistance(this.mousePos,potentialSelections[n].pos) <= potentialSelections[n].size+50) 
			{
				node = potentialSelections[n];
			}
		}
		//if selectedNodes has no nodes in it, select the clicked node
		if (node != null) 
		{
			this.selecting = true;
			this.addSelectedNode(node);
		}
		else //initiate click-drag mode 
		{
			this.dragMode = true;
		}
	}
	else //if in spectator, enable draggin
	{
		this.dragMode = true;
	}
}
PlayerController.prototype.getMouseMove = function(e) 
{
	let nextPos = new Position((e.clientX*graphics.zoomLevel)+graphics.x, (e.clientY*graphics.zoomLevel)+graphics.y);
	if (this.team !== undefined && this.selecting)
	{
		//detect the node that the mosue is over
		let node = null;
		let potentialSelections = gameMap.checkAllInRange(this.mousePos,250);
		for (let n in potentialSelections) 
		{
			if (Position.getDistance(this.mousePos,potentialSelections[n].pos) <= potentialSelections[n].size+50) 
			{
				node = potentialSelections[n];
			}
		}
		//select the clicked node
		if (node != null) 
		{
			this.addSelectedNode(node);
		}
	}
	else 
	{
		if (this.dragMode) //drag the screen
		{
			let dx = this.mousePos.x-nextPos.x;
			let dy = this.mousePos.y-nextPos.y;
			graphics.x += dx;
			graphics.y += dy;
			nextPos.x += dx; nextPos.y += dy;
		}
	}
	this.mousePos = nextPos;
}
//reads mouse input
PlayerController.prototype.getMouseUp = function(e) 
{
	e.stopPropagation();
	//get mouse position relative to the viewport's position(?)
	this.mousePos = new Position((e.clientX*graphics.zoomLevel)+graphics.x,(e.clientY*graphics.zoomLevel)+graphics.y);
	//controls do not operate if players has not spawned in
	if (this.team !== undefined && this.selecting)
	{
		this.selecting = false;
		//detect the node that is clicked on
		let node = null;
		let potentialSelections = gameMap.checkAllInRange(this.mousePos,250);
		for (let n in potentialSelections) 
		{
			if (Position.getDistance(this.mousePos,potentialSelections[n].pos) <= potentialSelections[n].size+50) 
			{
				node = potentialSelections[n];
			}
		}
		//if a node is selected, move units between both nodes
		if (node != null && node != this.selectedNodes[0])
		{
			for (let x in this.selectedNodes) 
			{
				let otherNode = this.selectedNodes[x];
				otherNode.selected = false;
				let unitsTransferred = Math.floor(otherNode.getUnitsOfTeam(this.team).number/2);
				if (node != null && node != otherNode)
				{
					this.newGroups.push(this.moveUnits(otherNode,node,unitsTransferred)); //creates a new moving group and pushes it to newGroups
				}
			}
			//initialize double click detection
			setTimeout(function(_this){_this.newGroups = [];},500,this);
			//clear all selected nodes
			this.selectedNodes = [];
		}
	}
	else 
	{
		for (let x in this.selectedNodes)
			this.selectedNodes[x].selected = false;
		this.selectedNodes = [];
		this.dragMode = false;
	}
}
//gets a double click
PlayerController.prototype.getDoubleClick = function(e) 
{
	for (let x in this.newGroups) 
	{
		//double the send amounts
		let group = this.newGroups[x];
		if (group != undefined)
		{
			let unitsAdded = group.startNode.getUnitsOfTeam(group.team).number;
			group.startNode.addUnits(group.team,-unitsAdded);
			group.number += unitsAdded;
			//deselect the node selected by the single-click event
			for (let n in this.selectedNodes)
			{
				this.selectedNodes[n].selected = false;
			}
			this.selectedNodes = [];
		}
	}
}
//call initialization method at end of code so that all methods are loaded first
//}

