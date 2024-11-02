import DisplayMode from "./enums/displayMode.js";

async function initApp()
{

	let manifestResponse = await fetch('usb/manifest.json');
	let manifest = await manifestResponse.json();
	let activeIndex = 3;
	let activeVideoEl = null;
	const THROTTLE_SPEED = 500;


	const throttle = (callback, limit) =>
	{
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
		if(hhmmss === -1) return hhmmss;

		let splitTime = hhmmss.split(':');
		return splitTime.length === 3 ?
			(Number(splitTime[0]) * 3600) + (Number(splitTime[1]) * 60) + Number(splitTime[2]) :
			hhmmss;
	};


	const modeBasedCall_CarouselVideo = (carouselFn, videoFn) =>
		getMode() === DisplayMode.CAROUSEL ?
			carouselFn() :
			videoFn();


	const initAudioCompressor = ()=>
	{
		const videoElement = document.querySelector('video');

		const audioContext = new (window.AudioContext || window.webkitAudioContext)();
		const source = audioContext.createMediaElementSource(videoElement);
		const gainNode = audioContext.createGain();
		const compressor = audioContext.createDynamicsCompressor();


		compressor.threshold.setValueAtTime(-50, audioContext.currentTime); // Tamp down loud segments (anything above 50db)
		compressor.knee.setValueAtTime(8, audioContext.currentTime);       // Smooth transition into compression; higher = smoother
		compressor.ratio.setValueAtTime(6, audioContext.currentTime);       // Moderate compression ratio 6:1 (for every n decibels above threshold, 1 makes it through)
		compressor.attack.setValueAtTime(0.005, audioContext.currentTime);   // Quick response to loud sounds
		compressor.release.setValueAtTime(0.1, audioContext.currentTime);   // Smooth release to avoid abrupt volume changes

		// gainNode.gain.value = 1;

		source.connect(compressor);
		compressor.connect(gainNode);
		gainNode.connect(audioContext.destination);
	}


	const initCarousel = () =>
	{
		let carouselEl = document.querySelector('[data-id=CarouselComponent]');
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
					src="${manifest.settings.mediaPath}/${video.thumbnailPath}"
				>
				<h3>${video.name}</h3>
			</div>`
		).join('');
		advanceSlideshow();
		setTimeout(() => { carouselEl.classList.add('loaded'); }, 1000);
	};


	const getElementIndex = index =>
	{
		return document.querySelector(`section > div:nth-of-type(${index})`);
	};


	const resetStyles = () =>
	{
		document.querySelector('.prev')?.classList.remove('prev');
		document.querySelector('.active')?.classList.remove('active');
		document.querySelector('.next')?.classList.remove('next');
	};


	const getMode = () =>
		document.querySelector('[data-id=App]')?.dataset?.mode;


	const initVideoTag = (url, startTime, endTime = 0) =>
	{
		let el = document.querySelector('[data-id=VideoComponent]');
		let parent = el.parentNode;
		el.remove();
		let vid = document.createElement('video');
		vid.dataset.id = 'VideoComponent';
		vid.dataset.startTime = startTime;
		vid.dataset.videoEnd = endTime;
		vid.innerHTML = `<source src="${manifest.settings.mediaPath}/${url}" type="video/mp4">`;
		parent.appendChild(vid);
		activeVideoEl = document.querySelector('video');
	};


	const addVideoEndHandler = (endTime) =>
	{
		endTime === -1 ?
			activeVideoEl.addEventListener('ended', handleVideoEnded) :
			activeVideoEl.addEventListener('timeupdate', handleVideoTimeUpdated);
	};


	const removeVideoEndHandler = () =>
	{
		activeVideoEl?.removeEventListener('timeupdate', handleVideoTimeUpdated);
		activeVideoEl?.removeEventListener('ended', handleVideoEnded);
	};


	const toggleUIMode = () =>
	{
		let el = document.querySelector('[data-id=App]');
		modeBasedCall_CarouselVideo(
			() => el.dataset.mode = DisplayMode.VIDEO,
			() => el.dataset.mode = DisplayMode.CAROUSEL
		);
	};


	const handleVideoEnded = () =>
	{
		if (!activeVideoEl) return;
		playNextVideo();
	};


	const handleVideoTimeUpdated = () =>
	{
		if (!activeVideoEl) return;
		if (activeVideoEl.currentTime < activeVideoEl.dataset.videoEnd) return;
		playNextVideo();
	};


	const advanceSlideshow = () =>
	{
		// if(activeIndex === itemCount) return;

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
		let section = document.querySelector('section');
		section.insertBefore(section.lastElementChild, section.firstElementChild);
	};


	const moveFirstSlideLast = () =>
	{
		let section = document.querySelector('section');
		section.appendChild(section.firstElementChild);
	};


	const toggleVideoPlay = () =>
	{
		const video = document.querySelector('video');
		if (!video) return;
		video.paused ? video.play() : video.pause();
	};


	const playVideo = (startTime = 0) =>
	{
		initAudioCompressor();
		let videoEl = document.querySelector('video');
		if (!videoEl) return;
		videoEl.currentTime = startTime;
		videoEl.play();
	};


	const pauseVideo = () => document.querySelector('video')?.pause();


	const restartVideo = () =>
	{
		let startTime = getElementIndex(activeIndex)?.dataset['videoStart'] || 0;
		document.querySelector('video').currentTime = startTime;
	};


	const getLoopedStartTime = (startTime, endTime) =>
	{
		let secondsSinceEpoch = Math.floor(Date.now() / 1000);
		let loopDuration = endTime - startTime;
		return (Number(startTime) + Math.ceil(secondsSinceEpoch % loopDuration));
	};


	const playNextVideo = () =>
	{
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
			modeBasedCall_CarouselVideo(
				advanceSlideshow,
				playNextVideo
			)
		},
		THROTTLE_SPEED
	);



	const addEventHandlers = () =>
	{
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


	initCarousel();
	addEventHandlers();


	const socket = new WebSocket('ws://localhost:8765');


	const socketOpenPromise = new Promise((resolve, reject) =>
	{
		socket.addEventListener('open', function (event)
		{
			console.log('WebSocket connection established.');
			// Notify the Python script that the page is ready
			socket.send(JSON.stringify({ type: 'pageReady' }));
			resolve();
		});

		socket.addEventListener('error', function (event)
		{
			console.error('WebSocket error:', event);
			reject(event);
		});
	});


	await socketOpenPromise;


	socket.addEventListener('message', function (event)
	{
		const data = JSON.parse(event.data);
		if (data.type === 'command' && typeof window[data.command] === 'function')
		{
			window[data.command]();
		}
	});


}

initApp();
