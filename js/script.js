// GLOBAL VARIABLES
// const url = 'http://34.243.3.31:8080'
const url = 'http://localhost:8080'
const auth = {'X-Group-Token' : '9GAqC9CWYLNH'}
var CL_size = 20
var CL_page = 0
var c_interval = null
var name = "user"
var activeChannel = -1
var m_timeout  = true
var m_interval = null
var ALL_M = {}
//! END GLOBAL VARIABLES

// EXECUTE ON PAGE LOAD
$(document).ready(function() {
	// Runs on page load and sets up the initial channel list, the standard user
	// and the interval to refresh the channel list every 10 sec
	refreshCL(0)
	setUserName(name)
	c_interval = setInterval(refreshCL, 10000)
	refreshM()
});
//! END EXECUTE ON PAGE LOAD

// APPLICATION LOGIC
function setUserName(NName) {
	// Set the current user name
	name = NName
	$("#a-name").text(NName)
}

function reset() {
	// Reset everything related to joining a channel, restoring the default page.
	activeChannel = -1
	displayM(-1)
	$("#m-list-w").html("")
	$("#c-info-header").html('<span id="ci-id"></span><span id="ci-name"></span><span id="ci-topic"></span>')
	$("#c-member-list").html("")
}

function setSizeIndicator(size=CL_size) {
	// Update the value indicator next to the slider.
	// Called by the slider every time the value changes.
	$("#CL-S-value").html(`${size}`)
}

function setCLSize(size) {
	// Update the amount of elements displayed in the channel list.
	// Called by the slider every time it's released.
	CL_size = parseInt(size, 10)
	setSizeIndicator(size)
	refreshCL(0)
}

function refreshCL(pageNr=CL_page) {
	// Refresh the list of Channels by sending a web request and then displaying
	// the result
	CL_page = pageNr
	renderCL(getCL(pageNr, CL_size))
}

function renderCL(pro) {
	// Create all elements necessary to display the list of channels
	// and appends them to the HTML document.
	pro.then(function(res) {
		// List of Channels
		var div_c = document.createElement("div")
		res._embedded.channelList.forEach(function(c) {
		div_c.append(CLItem(c.id, c.name, c.topic))
		})
		$("#CL").html(div_c.innerHTML)
		// List of Pages
		var tP = res.page.totalPages
		var div_p = document.createElement("div")
		for (i = 0; i < tP; i++) {div_p.append(CPLItem(i))}
		$("#CL-PL").html(div_p.innerHTML)
		// Change max Slider length
		var tE = res.page.totalElements
		$(".slider").each(function() {
			this.max = (tE + (5 - (tE % 5)))
		})
	})
}

function openForm() {
	// Opens the Form for creating a new channel
	document.getElementById("toggle-w").style.display = "block";
}

function closeForm() {
	// Closes create channel form
	document.getElementById("toggle-w").style.display = "none";
}

function createChannelA(name, topic) {
	// Create a new channel with 'name' and 'topic'.
	// Called when the user clicks on 'create' in the create channel menu.
	// arguments to this function are taken from the two text fields in the menu.
	createChannel(name, topic)
	.then(function(res) {
		console.log(res)
		refreshCL()
		$("#form-w")[0].reset()
		closeForm()
		joinChannel(res.id)
	}, function(error) {
		alert(error)
	})
}

function joinChannel(channelID) {
	// Join a channel by clearing all previous state and then starting 
	// the message refresh function.
	// Called by the user clicking on any of the 'join' buttons
	getChannelInfo(channelID).then(res => setCInfo(res.id, res.name, res.topic))
	refreshUsers(channelID)
	activeChannel = channelID
	displayM(channelID)
}

async function refreshM(channelID=activeChannel) {
	// Called once every second, by setting a timeout at the end of this function.
	// Refresh the list of Users in a channel and the messages.
	if (channelID > 0) {
		try {
			var ts = null
			if (channelID in ALL_M) {
				ts = ALL_M[channelID]['ts']
			}
			refreshUsers(channelID)
			await renderM(getMessages(channelID, ts))
		} catch(error) {
			console.error(error)
		}
		displayM()
	} else {
		// not in a channel
		$("#m-list-w").html("")
		$("#c-info-header").html('<span id="ci-id"></span><span id="ci-name"></span><span id="ci-topic"></span>')
		$("#c-member-list").html("")
	}
	clearTimeout(m_interval)
	if (m_timeout) {
		m_interval = setTimeout(refreshM, 1000)
	}
}

var lockM = true
function renderM(pro) {
	// Input is a promise of the json response from getMessages()
	// Find out the channel id from the response and add a Date object
	return pro.then(function(res) {
		if (res.page.totalElements <= 0) {
			// Channel doesn't have any messages
		} else {
			let M = res._embedded.messageList
			let cid = M[0].channel.id
			M = M.map(function(m) {
				return { 
					"id" : m.id,
					"d"  : new Date(m.timestamp),
					"ts" : m.timestamp,
					"creator" : m.creator,
					"content" : m.content
				}
			})
			if (lockM) {
				lockM = false
				try {
					updateM(M, cid)
				} catch(error) {
					//just in case, because we need lockM to be released in 100% of cases
					console.error(error)
				}
				lockM = true
			}
		}
	})
}

function updateM(M, cid) {
	// Update the cache of Messages
	// Construct a new Object with the messages, converted to HTML objects,
	// the most recent timestamp, and the most recent ID
	// Concat new messages with old ones, if there already are any
	// then save the created object in ALL_M
	var A = {}
	if (cid in ALL_M) {
		let prev = ALL_M[cid]
		M = M.filter(m => m.id > prev['id'])
		if (M.length <= 0) {
			return
		} else {
			M = M.sort(sortM)
			let ts = M[M.length - 1].ts 
			let id = M[M.length - 1].id
			A['M']  = prev['M'].concat(M.map(m => toHTMLItemM(m)))
			A['ts'] = ts
			A['id'] = id
			ALL_M[cid] = A
		}
	} else {
		M = M.sort(sortM)
		let ts = M[M.length - 1].ts 
		let id = M[M.length - 1].id
		A['M']   = M.map(m => toHTMLItemM(m))
		A['ts'] = ts
		A['id'] = id
		ALL_M[cid] = A
	}
}

function sortM(a, b) {
	// Sort Messages by comparing date objects / by id if dates are equal
	// The most recent Message is the last element of the new Array
	if          (a.d  > b.d) {return 1}
	else if     (a.d  < b.d) {return -1}
	else {return a.id > b.id ? 1 : -1}
}

function toHTMLItemM(m) {
	// Convenience function to convert json to html
	return MessageItem(m.id, m.creator, m.content, m.d.toString())
}

function displayM(cid=activeChannel) {
	// Display the saved messages for a channel
	// If there are no saved messages for this channel,
	// then clear all displayed messages
	if (cid in ALL_M) {
		M = ALL_M[cid]['M']
		var div_m = document.createElement("div")
		M.forEach(function(m) {
			div_m.append(m)
		})
		$("#m-list-w").html(div_m.innerHTML)
	} else {
		$("#m-list-w").html("")
	}
}

function setCInfo(cid, cname, ctopic) {
	// Set the header information about the active channel
	$("#ci-id").text(`ID: ${cid}`)
	$("#ci-name").text(`Name: ${cname}`)
	$("#ci-topic").text(`Topic: ${ctopic}`)
}

function refreshUsers(channelID=activeChannel) {
	// Display the active users of a channel, by sending a web request
	// and then passing the answer to renderUsers()
	renderUsers(getUsers(channelID))
}

function renderUsers(pro) {
	// Receive json data, convert content to html elements
	// and then append then to the html document
	pro.then(res => {
		var div_u  = document.createElement("div")
		for (var key in res) {
			div_u.append(UserItem(res[key]))
		}
		$("#c-member-list").html(div_u.innerHTML)
	})
}

async function sendMessageA(msg, channelID=activeChannel) {
	// Send a message and refresh the list of shown messages
	// The refresh will probably happen before the request finishes,
	// but doing it this way still feels more responsive
	if (channelID <= 0) {return}
	var ts = null
	if (channelID in ALL_M) {ts = ALL_M[channelID]['ts']}
	await renderM(sendMessage(msg, channelID, ts))
	displayM()
}
//! END APPLICATION LOGIC

// HTML ITEMS
function CLItem(id, name, topic) {
	// HTML Item for one element in the channel list
	var li           = document.createElement("div")
	li.className     = "c-list-elem"
	var div1         = document.createElement("div")
	div1.className   = "c-id"
	div1.textContent = `ID:      ${id}`
	var div2         = document.createElement("div")
	div2.className   = "c-name"
	div2.textContent = `Channel: ${name}`
	var div3         = document.createElement("div")
	div3.className   = "c-topic"
	div3.textContent = `Topic:   ${topic}`
	var inp          = document.createElement("input")
	inp.type         = "button"
	inp.className    = "c-join"
	inp.value        = "Join"
	inp.setAttribute("onclick", `joinChannel(${id})`)
	li.append(div1, div2, div3, inp)
	return li
}

function CPLItem(i) {
	// HTML Button to change the page of the channel list
	var pe       = document.createElement("input")
	pe.type      = "button"
	pe.className = "p-list-elem"
	pe.value     = `${i}`
	pe.setAttribute("onclick", `refreshCL(${i})`)
	return pe
}

function MessageItem(id, creator, content, timestamp) {
	// HTML Item for one message
	var div  = document.createElement("div")
	div.className = "m-list-elem"
	var div1 = document.createElement("div")
	div1.className = "m-id"
	div1.textContent = `ID: ${id}`
	var div2 = document.createElement("div")
	div2.className = "m-creator"
	div2.textContent = `Creator: ${creator}`
	var div3 = document.createElement("div")
	div3.className = "m-content"
	div3.textContent = `Content: ${content}`
	var div4 = document.createElement("div")
	div4.className = "m-timestamp"
	div4.textContent = `Timestamp: ${timestamp}`
	div.append(div1, div2, div3, div4)
	return div
	
}

function UserItem(uname) {
	// HTML Item for one user in the user list
	var div = document.createElement("div")
	div.className = "member"
	div.textContent = `User: ${uname}`
	return div
}
//! END HTML ITEMS

// NETWORK REQUESTS
function getCL(page=0, size=CL_size) {
	// GET the latest list of channels from the backend
	let opts = {
		headers:new Headers(auth)
	}
	console.log("Updating CL from: " + url + `/channels?page=${page}&size=${size}`)
	return fetch(url + `/channels?page=${page}&size=${size}`, opts)
	.then(function(res) {
		switch(res.status) {
			case 200:
				return res.json();
				break;
			default:
				throw new Error(`HTTP Status Error: ${res.status}`);
		}
	})
};

function createChannel(name, topic) {
	// POST create a new channel with name and topic
	let opts = {
		method : 'POST',
		headers : new Headers(Object.assign({}, auth, {'Content-Type' : 'application/json'})),
		body : JSON.stringify({'name' : name, 'topic' : topic})
	}
	return fetch(url + '/channels', opts)
	.then(function(res) {
		switch(res.status) {
			case 201:
				return res.json();
				break;
			case 409:
				throw new Error(`Channel Name already exists: ${res.status}`);
				break;
			default:
				throw new Error(`HTTP Status Error: ${res.status}`);
		}
	})
};

function getChannelInfo(channelID) {
	// GET info about a channel
	let opts = {
		headers:new Headers(auth)
	}
	return fetch(url + `/channels/${channelID}`, opts)
	.then(function(res) {
		switch(res.status) {
			case 200:
				return res.json();
				break;
			case 404:
				throw new Error(`Channel ID doesn't exist: ${res.status}`);
				break;
			default:
				throw new Error(`HTTP Status Error: ${res.status}`);
		}
	})
}

function getMessages(channelID, timestamp=null, page=null) {
	// GET the most recent messages of a channel
	let opts = {
		headers:new Headers(auth)
	}
	args = ""
	if (timestamp !== null) {
		args += `?lastSeenTimestamp=${timestamp}`
		if (page !== null) {args += `&page=${page}`}
	} else {
		if (page !== null) {args += `?page=${page}`}
	}
	console.log("Fetching: " + url + `/channels/${channelID}/messages${args}`)
	return fetch(url + `/channels/${channelID}/messages${args}`, opts)
	.then(function(res) {
		switch(res.status) {
			case 200:
				return res.json();
				break;
			case 404:
				throw new Error(`Channel ID doesn't exist: ${res.status}`);
				break;
			default:
				throw new Error(`HTTP Status Error: ${res.status}`);
		}
	})
}

function sendMessage(msg, channelID=activeChannel, timestamp=null) {
	// POST a new message to a channel
	if (channelID === null || channelID <= 0) {
		throw new Error(`Not a valid Channel ID, was: ${channelID}`)
	}
	let opts = {
		method : 'POST',
		headers : new Headers(Object.assign({}, auth, {'Content-Type' : 'application/json'})),
		body : JSON.stringify({'creator' : name, 'content' : msg})
	}
	args = ""
	if (timestamp !== null) {args += `?lastSeenTimestamp=${timestamp}`}
	return fetch(url + `/channels/${channelID}/messages${args}`, opts)
	.then(function(res) {
		switch(res.status) {
			case 200:
				return res.json();
				break;
			case 404:
				throw new Error(`Channel ID doesn't exist: ${res.status}`);
				break;
			default:
				throw new Error(`HTTP Status Error: ${res.status}`);
		}
	})
}

function getUsers(channelID) {
	// GET most recent list of active users of a channel
	let opts = {
		headers:new Headers(auth)
	}
	return fetch(url + `/channels/${channelID}/users`, opts)
	.then(function(res) {
		switch(res.status) {
			case 200:
				return res.json();
				break;
			default:
				throw new Error(`HTTP Status Error: ${res.status}`);
		}
	})
}
//! END NETWORK REQUESTS