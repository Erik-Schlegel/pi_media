import DisplayMode from "./enums/displayMode.js";

(async ()=>
	{
		let manifest = await fetch('usb/manifest.json');
		manifest = await manifest.json();


		let itemCount = manifest.videos.length;
		let activeIndex = 1;

		let activeVideoEl = null;


		const toSeconds = hhmmss=>
		{
			if(hhmmss === -1) return hhmmss;

			let splitTime = hhmmss.split(':');
			return splitTime.length === 3 ?
				(Number(splitTime[0]) * 3600) + (Number(splitTime[1]) * 60) + Number(splitTime[2]):
				hhmmss
		}


		const modeBasedCall_CarouselVideo = (carouselFn, videoFn) =>
			getMode() === DisplayMode.CAROUSEL ?
				carouselFn() :
				videoFn();



		const initCarousel = ()=>
		{
			let carouselEl = document.querySelector('[data-id=CarouselComponent]');
			carouselEl.innerHTML = manifest.videos.map(video=>
				`<div data-video-path="${video.videoPath}" data-video-start=${video.startTime} data-video-end=${toSeconds(video.endTime)}>
					<img
						width="${manifest.settings.thumbnail.width}"
						height="${manifest.settings.thumbnail.height}"
						src="${video.thumbnailPath}"
					>
					<h3>${video.name}</h3>
				</div>`
			).join('');
			advanceSlideshow();
			setTimeout(()=>{carouselEl.classList.add('loaded')}, 1000);
		}


		const getElementIndex = index =>
		{
			return document.querySelector(`section > div:nth-of-type(${index})`);
		}


		const resetStyles = ()=>
		{
			document.querySelector('.prev')?.classList.remove('prev');
			document.querySelector('.active')?.classList.remove('active');
			document.querySelector('.next')?.classList.remove('next');
		}


		const getMode = ()=>
			document.querySelector('[data-id=App]')?.dataset?.mode;


		const initVideoTag = (url, endTime=0)=>
		{
			let el = document.querySelector('[data-id=VideoComponent]');
			let parent = el.parentNode;
			el.remove();
			let vid = document.createElement('video');
			vid.dataset.id = 'VideoComponent';
			vid.dataset.videoEnd = endTime;
			vid.innerHTML = `<source src="file:///home/media/eschware/pi_media/usb/${url}" type="video/mp4">`;
			parent.appendChild(vid);
			activeVideoEl = document.querySelector('video');
		}


		const addVideoEndHandler = ()=>
		{
			activeVideoEl.addEventListener('timeupdate', handleVideoTimeUpdated);
		}


		const removeVideoEndHandler = ()=>
		{
			activeVideoEl?.removeEventListener('timeupdate', handleVideoTimeUpdated);
		}


		const toggleUIMode = ()=>
		{
			let el = document.querySelector('[data-id=App]');
			modeBasedCall_CarouselVideo(
				()=> el.dataset.mode = DisplayMode.VIDEO,
				()=> el.dataset.mode = DisplayMode.CAROUSEL
			)
		}


		const handleVideoTimeUpdated = ()=>
		{
			if(!activeVideoEl) return;
			if(activeVideoEl.currentTime < activeVideoEl.dataset.videoEnd) return;
			playNextVideo()
		}


		const handleEnterPress = ()=>
		{
			modeBasedCall_CarouselVideo(
				()=>
				{
					toggleUIMode();
					let selectedSlide = getElementIndex(activeIndex);
					removeVideoEndHandler();
					initVideoTag(selectedSlide.dataset['videoPath'], selectedSlide.dataset['videoEnd']);
					addVideoEndHandler();
					playVideo(selectedSlide.dataset['videoStart']);
				},
				()=> toggleVideoPlay()
			)
		}


		const handleUpPress = ()=>
		{
			modeBasedCall_CarouselVideo(
				()=>{},
				()=>
				{
					pauseVideo();
					toggleUIMode();
				}
			)
		}


		const handleLeftPress = ()=>
		{
			modeBasedCall_CarouselVideo(
				rewindSlideshow,
				restartVideo
			);
		}


		const handleRightPress = ()=>
		{
			modeBasedCall_CarouselVideo(
				advanceSlideshow,
				playNextVideo
			)
		}


		const advanceSlideshow = ()=>
		{
			if(activeIndex === itemCount) return;

			resetStyles();

			//active becomes previous
			let active = getElementIndex(activeIndex);
			active.classList.add('prev');

			//next becomes active
			let next = getElementIndex(activeIndex+1);
			next.classList.add('active');

			if(activeIndex <= itemCount)
			{
				getElementIndex(++activeIndex+1)?.classList.add('next');
			}
		}


		const rewindSlideshow = ()=>
		{
			if(activeIndex === 1) return;

			resetStyles();

			//active becomes next
			let active = getElementIndex(activeIndex);
			active.classList.add('next');

			//previous becomes active
			let prev = getElementIndex(activeIndex-1);
			prev.classList.add('active');

			if(activeIndex >= 2)
			{
				getElementIndex(--activeIndex-1)?.classList.add('prev');
			}
		}


		const toggleVideoPlay = ()=>
		{
			const video = document.querySelector('video');
			if(!video) return;
			video.paused ? video.play() : video.pause();
		}


		const playVideo = (startTime=0)=>
		{
			let videoEl = document.querySelector('video');
			if(!videoEl) return;
			videoEl.currentTime = startTime;
			videoEl.play();
		}

		const pauseVideo = ()=> document.querySelector('video')?.pause();


		const restartVideo = ()=>
		{
			let startTime = getElementIndex(activeIndex)?.dataset['videoStart'] || 0;
			document.querySelector('video').currentTime = startTime;
		}


		const playNextVideo = ()=>
		{
			advanceSlideshow();
			let selectedSlide = getElementIndex(activeIndex);
			removeVideoEndHandler();
			initVideoTag(selectedSlide.dataset['videoPath'], selectedSlide.dataset['videoEnd']);
			addVideoEndHandler();
			playVideo(selectedSlide.dataset['videoStart']);
		}



		const addEventHandlers = ()=>
		{
			document.addEventListener('keyup', e=>
			{
				if(
					e.key !== 'Enter' &&
					e.key !== 'ArrowUp' &&
					e.key !== 'ArrowRight' &&
					e.key !== 'ArrowLeft'
				)
					return;

				e.preventDefault();

				e.key === 'Enter' && handleEnterPress();
				e.key === 'ArrowUp' && handleUpPress();
				e.key === 'ArrowRight' && handleRightPress();
				e.key === 'ArrowLeft' && handleLeftPress();

			})
		}


		initCarousel();
		addEventHandlers();
	}
)();
