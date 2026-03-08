import DisplayMode from "./enums/displayMode.js";

async function initApp()
{
	console.log('initApp');

	const carouselElSelector = '[data-id=CarouselComponent]';
	const videoElSelector = '[data-id=VideoComponent]';
	const THROTTLE_SPEED = 500;
	const manifestPath = 'resources/manifest.json';

	let manifestResponse = await fetch(manifestPath);
	let manifest = await manifestResponse.json();
	const manifestUrl = new URL(manifestPath, window.location.href);
	const manifestDirectoryUrl = new URL('.', manifestUrl);
	const configuredMediaPath = manifest?.settings?.mediaPath ?? '.';
	const normalizedMediaPath = configuredMediaPath === '.' ? './' : `${configuredMediaPath.replace(/\/$/, '')}/`;
	const mediaBaseUrl = new URL(normalizedMediaPath, manifestDirectoryUrl);
	let activeIndex = 3;
	let activeVideoEl = null;
	let _audioContext = null;
	let socket = null;
	const pendingLogs = [];


	const safeStringify = value =>
	{
		try
		{
			return JSON.stringify(value);
		}
		catch (_e)
		{
			return String(value);
		}
	};


	const sendClientLog = payload =>
	{
		const basePayload = {
			type: 'clientLog',
			timestamp: new Date().toISOString(),
			...payload,
		};

		if (socket?.readyState === WebSocket.OPEN)
		{
			try
			{
				socket.send(JSON.stringify(basePayload));
			}
			catch (error)
			{
				console.error('[pi_media] Failed to send client log over WebSocket', error);
				pendingLogs.push(basePayload);
			}
			return;
		}

		pendingLogs.push(basePayload);
	};


	const reportError = (message, error = null, extra = null) =>
	{
		const stack = error?.stack || null;
		const errorMessage = error?.message || null;
		console.error(`[pi_media] ${message}`, error || '', extra || '');
		sendClientLog({
			level: 'error',
			message,
			errorMessage,
			stack,
			extra,
		});
	};


	const reportInfo = (message, extra = null) =>
	{
		console.log(`[pi_media] ${message}`, extra || '');
		sendClientLog({
			level: 'info',
			message,
			extra,
		});
	};


	const throttle = (callback, limit) =>
	{
		console.log('throttle');
		var waiting = false;
		return ()=>
		{
			if(waiting) return;
			callback.apply(this, arguments);
			waiting = true;
			setTimeout(
				()=> waiting = false,
				limit
			);
		}
	}


	const toSeconds = hhmmss =>
	{
		console.log('toSeconds');
		if(hhmmss === -1) return hhmmss;

		let splitTime = hhmmss.split(':');
		return splitTime.length === 3 ?
			(Number(splitTime[0]) * 3600) + (Number(splitTime[1]) * 60) + Number(splitTime[2]) :
			hhmmss;
	};


	const resolveMediaUrl = mediaRelativePath =>
	{
		const sanitizedPath = String(mediaRelativePath || '').replace(/^\.\//, '');
		return new URL(sanitizedPath, mediaBaseUrl).toString();
	};


	const modeBasedCall_CarouselVideo = (carouselFn, videoFn) =>
	{
		console.log('modeBasedCall_CarouselVideo', carouselFn, videoFn);
		getMode() === DisplayMode.CAROUSEL ?
			carouselFn() :
			videoFn();
	}


	const initAudioCompressor = ()=>
	{
		console.log('initAudioCompressor');

		//This should only run once per page load. Else, we get fun memory leaks.
		if(_audioContext) return;

		const videoEl = document.querySelector(videoElSelector);

		_audioContext = new (window.AudioContext || window.webkitAudioContext)();
		const source = _audioContext.createMediaElementSource(videoEl);
		const gainNode = _audioContext.createGain();
		const compressor = _audioContext.createDynamicsCompressor();


		compressor.threshold.setValueAtTime(-50, _audioContext.currentTime); // Tamp down loud segments (anything above 50db)
		compressor.knee.setValueAtTime(8, _audioContext.currentTime);       // Smooth transition into compression; higher = smoother
		compressor.ratio.setValueAtTime(6, _audioContext.currentTime);       // Moderate compression ratio 6:1 (for every n decibels above threshold, 1 makes it through)
		compressor.attack.setValueAtTime(0.005, _audioContext.currentTime);   // Quick response to loud sounds
		compressor.release.setValueAtTime(0.1, _audioContext.currentTime);   // Smooth release to avoid abrupt volume changes

		// gainNode.gain.value = 1;

		source.connect(compressor);
		compressor.connect(gainNode);
		gainNode.connect(_audioContext.destination);
	}


	const initCarousel = () =>
	{
		console.log('initCarousel');

		let carouselEl = document.querySelector(carouselElSelector);
		carouselEl.innerHTML = manifest.videos.map(video =>
			`<div
				data-video-path="${video.videoPath}"
				data-video-start=${toSeconds(video.startTime)}
				data-video-end=${toSeconds(video.endTime)}
				data-video-simulate-bg-loop="${video.simulateBackgroundLoop}"
			>
				<img
					width="${manifest.settings.thumbnail.width}"
					height="${manifest.settings.thumbnail.height}"
					src="${resolveMediaUrl(video.thumbnailPath)}"
				>
				<h3>${video.name}</h3>
			</div>`
		).join('');
		advanceSlideshow();
		setTimeout(() => { carouselEl.classList.add('loaded'); }, 1000);
	};


	const getElementIndex = index =>
	{
		console.log('getElementIndex');
		return document.querySelector(`section > div:nth-of-type(${index})`);
	};


	const resetStyles = () =>
	{
		console.log('resetStyles');
		document.querySelector('.prev')?.classList.remove('prev');
		document.querySelector('.active')?.classList.remove('active');
		document.querySelector('.next')?.classList.remove('next');
	};


	const getMode = () => {
		console.log('getMode');
		return document.querySelector('[data-id=App]')?.dataset?.mode;
	}


	const initVideoTag = (url, startTime, endTime = 0) =>
	{
		console.log('initVideoTag');
		let videoEl = document.querySelector(videoElSelector);

		// Clean up the existing element
		videoEl.pause();
		videoEl.removeAttribute('src');
		videoEl.load(); // Forces release of media resources

		while (videoEl.firstChild)
			videoEl.removeChild(videoEl.firstChild);

		videoEl.dataset.startTime = startTime;
		videoEl.dataset.videoEnd = endTime;

		const source = document.createElement('source');
		source.src = resolveMediaUrl(url);
		source.type = 'video/mp4';
		videoEl.appendChild(source);

		activeVideoEl = videoEl;
		reportInfo('Video source initialized', {
			source: source.src,
			startTime,
			endTime,
		});

		initAudioCompressor();
	};


	const addVideoEndHandler = (endTime) =>
	{
		console.log('addVideoEndHandler');

		endTime === -1 ?
			activeVideoEl.addEventListener('ended', handleVideoEnded) :
			activeVideoEl.addEventListener('timeupdate', handleVideoTimeUpdated);
	};


	const removeVideoEndHandler = () =>
	{
		console.log('removeVideoEndHandler');

		activeVideoEl?.removeEventListener('timeupdate', handleVideoTimeUpdated);
		activeVideoEl?.removeEventListener('ended', handleVideoEnded);
	};


	const toggleUIMode = () =>
	{
		console.log('toggleUIMode');

		let el = document.querySelector('[data-id=App]');
		modeBasedCall_CarouselVideo(
			() => el.dataset.mode = DisplayMode.VIDEO,
			() => el.dataset.mode = DisplayMode.CAROUSEL
		);
	};


	const handleVideoEnded = () =>
	{
		console.log('handleVideoEnded');

		if (!activeVideoEl) return;
		playNextVideo();
	};


	const handleVideoTimeUpdated = () =>
	{
		// console.log('handleVideoTimeUpdated');
		if (!activeVideoEl) return;
		if (activeVideoEl.currentTime < activeVideoEl.dataset.videoEnd) return;
		playNextVideo();
	};


	const advanceSlideshow = () =>
	{
		console.log('advanceSlideshow');
		resetStyles();

		// active becomes previous
		let active = getElementIndex(activeIndex);
		active.classList.add('prev');

		// next becomes active
		let next = getElementIndex(activeIndex + 1);
		next.classList.add('active');

		getElementIndex(activeIndex + 2)?.classList.add('next');
		moveFirstSlideLast();
	};


	const rewindSlideshow = () =>
	{
		console.log('rewindSlideshow');
		resetStyles();

		// active becomes next
		let active = getElementIndex(activeIndex);
		active.classList.add('next');

		// previous becomes active
		let prev = getElementIndex(activeIndex - 1);
		prev.classList.add('active');

		getElementIndex(activeIndex - 2)?.classList.add('prev');

		moveLastSlideFirst();
	};


	const moveLastSlideFirst = () =>
	{
		console.log('moveLastSlideFirst');

		let section = document.querySelector('section');
		section.insertBefore(section.lastElementChild, section.firstElementChild);
	};


	const moveFirstSlideLast = () =>
	{
		console.log('moveFirstSlideLast');
		let section = document.querySelector('section');
		section.appendChild(section.firstElementChild);
	};


	const toggleVideoPlay = () =>
	{
		console.log('toggleVideoPlay');
		const video = document.querySelector('video');
		if (!video) return;
		video.paused ? video.play() : video.pause();
	};


	const playVideo = async (startTime = 0) =>
	{
		console.log('playVideo');
		let videoEl = document.querySelector('video');
		if (!videoEl) return;
		videoEl.currentTime = startTime;
		videoEl.play().catch(error =>
		{
			reportError('video.play() rejected', error, {
				currentSrc: videoEl.currentSrc,
				readyState: videoEl.readyState,
				networkState: videoEl.networkState,
				currentTime: videoEl.currentTime,
				requestedStartTime: startTime,
			});
		});
	};


	const pauseVideo = () =>
	{
		console.log('pauseVideo');
		document.querySelector('video')?.pause();
	}


	const restartVideo = () =>
	{
		console.log('restartVideo');
		let startTime = getElementIndex(activeIndex)?.dataset['videoStart'] || 0;
		document.querySelector('video').currentTime = startTime;
	};


	const getLoopedStartTime = (startTime, endTime) =>
	{
		console.log('getLoopedStartTime');
		let secondsSinceEpoch = Math.floor(Date.now() / 1000);
		let loopDuration = endTime - startTime;
		return (Number(startTime) + Math.ceil(secondsSinceEpoch % loopDuration));
	};


	const playNextVideo = () =>
	{
		console.log('playNextVideo');
		advanceSlideshow();
		let selectedSlide = getElementIndex(activeIndex);
		removeVideoEndHandler();

		let videoEndTime = Number(selectedSlide.dataset['videoEnd']);
		let videoStartTime = Number(selectedSlide.dataset['videoStart']);
		initVideoTag(selectedSlide.dataset['videoPath'], videoStartTime, videoEndTime);

		let startTime = selectedSlide.dataset.videoSimulateBgLoop === "true" ?
			getLoopedStartTime(selectedSlide.dataset.videoStart, selectedSlide.dataset.videoEnd) :
			videoStartTime;

		playVideo(startTime);
		addVideoEndHandler(videoEndTime);
	};


	const playPreviousVideo = () =>
	{
		console.log('playPreviousVideo');
		rewindSlideshow();
		let selectedSlide = getElementIndex(activeIndex);
		removeVideoEndHandler();

		let videoEndTime = Number(selectedSlide.dataset['videoEnd']);
		let videoStartTime = Number(selectedSlide.dataset['videoStart']);
		initVideoTag(selectedSlide.dataset['videoPath'], videoStartTime, videoEndTime);

		let startTime = selectedSlide.dataset.videoSimulateBgLoop === "true" ?
			getLoopedStartTime(selectedSlide.dataset.videoStart, selectedSlide.dataset.videoEnd) :
			videoStartTime;

		playVideo(startTime);
		addVideoEndHandler(videoEndTime);
	};


	window.handleEnterPress = throttle(()=>
	{
		console.log('handleEnterPress');
		modeBasedCall_CarouselVideo(
			() =>
			{
				toggleUIMode();
				let selectedSlide = getElementIndex(activeIndex);
				removeVideoEndHandler();

				let videoEndTime = selectedSlide.dataset['videoEnd'];
				let videoStartTime = selectedSlide.dataset['videoStart'];
				initVideoTag(selectedSlide.dataset['videoPath'], videoStartTime, videoEndTime);

				addVideoEndHandler(videoEndTime);
				playVideo(selectedSlide.dataset['videoStart']);
			},
			() => toggleVideoPlay()
		)
	}, THROTTLE_SPEED);


	window.handleUpPress = throttle(
		()=>
		{
			console.log('handleUpPress');
			modeBasedCall_CarouselVideo(
				() => { },
				() =>
				{
					pauseVideo();
					toggleUIMode();
				}
			)
		},
		THROTTLE_SPEED
	);


	window.handleLeftPress = throttle(
		()=>
		{
			console.log('handleLeftPress');
			modeBasedCall_CarouselVideo(
				rewindSlideshow,
				() =>
				{
					let startTime = Number(getElementIndex(activeIndex)?.dataset['videoStart']);
					if ((activeVideoEl.currentTime - startTime) * 1000 < manifest.settings.rewindThresholdMS)
					{
						playPreviousVideo();
					}
					else
					{
						restartVideo();
					}
				}
			)
		},
		THROTTLE_SPEED
	);



	window.handleRightPress = throttle(
		()=>
		{
			console.log('handleRightPress');
			modeBasedCall_CarouselVideo(
				advanceSlideshow,
				playNextVideo
			)
		},
		THROTTLE_SPEED
	);



	const addEventHandlers = () =>
	{
		console.log('addEventHandlers');
		document.addEventListener('keyup', e =>
		{
			if (
				e.key !== 'Enter' &&
				e.key !== 'ArrowUp' &&
				e.key !== 'ArrowRight' &&
				e.key !== 'ArrowLeft'
			)
				return;

			e.preventDefault();

			e.key === 'Enter' && window.handleEnterPress();
			e.key === 'ArrowUp' && window.handleUpPress();
			e.key === 'ArrowRight' && window.handleRightPress();
			e.key === 'ArrowLeft' && window.handleLeftPress();

		});
	};


	const addErrorHandlers = () =>
	{
		window.addEventListener('error', event =>
		{
			reportError('Unhandled window error', event.error || null, {
				message: event.message,
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
			});
		});

		window.addEventListener('unhandledrejection', event =>
		{
			reportError('Unhandled promise rejection', event.reason instanceof Error ? event.reason : null, {
				reason: event.reason instanceof Error ? event.reason.message : safeStringify(event.reason),
			});
		});

		const videoEl = document.querySelector(videoElSelector);
		if (!videoEl) return;

		videoEl.addEventListener('error', () =>
		{
			const mediaError = videoEl.error;
			reportError('Video element error event', null, {
				currentSrc: videoEl.currentSrc,
				code: mediaError?.code,
				message: mediaError?.message || null,
				readyState: videoEl.readyState,
				networkState: videoEl.networkState,
				currentTime: videoEl.currentTime,
			});
		});

		['stalled', 'waiting', 'abort', 'suspend', 'emptied'].forEach(eventName =>
		{
			videoEl.addEventListener(eventName, () =>
			{
				reportInfo(`Video event: ${eventName}`, {
					currentSrc: videoEl.currentSrc,
					readyState: videoEl.readyState,
					networkState: videoEl.networkState,
					currentTime: videoEl.currentTime,
				});
			});
		});
	};




	initCarousel();
	addEventHandlers();
	addErrorHandlers();


	socket = new WebSocket('ws://localhost:8765');


	const socketOpenPromise = new Promise((resolve, reject) =>
	{
		console.log('socketOpenPromise');

		socket.addEventListener('open', function (event)
		{
			console.log('WebSocket connection established.');
			while (pendingLogs.length)
				socket.send(JSON.stringify(pendingLogs.shift()));
			// Notify the Python script that the page is ready
			socket.send(JSON.stringify({ type: 'pageReady' }));
			resolve();
		});

		socket.addEventListener('error', function (event)
		{
			console.error('WebSocket error:', event);
			reportError('WebSocket error event', null, {
				readyState: socket.readyState,
			});
			reject(event);
		});
	});


	await socketOpenPromise;


	socket.addEventListener('message', function (event)
	{
		console.log('socketEventListener');
		const data = JSON.parse(event.data);
		if (data.type === 'command' && typeof window[data.command] === 'function')
		{
			window[data.command]();
		}
	});


}

initApp();
