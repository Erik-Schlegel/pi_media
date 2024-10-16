import DisplayMode from "./enums/displayMode.js";

(async ()=>
	{
		let manifest = await fetch('usb/manifest.json');
		manifest = await manifest.json();


		let itemCount = manifest.videos.length;
		let activeIndex = 1;


		const initCarousel = ()=>
		{
			let carouselEl = document.querySelector('[data-id=CarouselComponent]');
			carouselEl.innerHTML = manifest.videos.map(video=>
				`<div>
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


		const toggleMode = ()=>
		{
			let el = document.querySelector('[data-id=App]');
			if(el.dataset.mode === DisplayMode.VIDEO)
			{
				pauseVideo();
				el.dataset.mode = DisplayMode.CAROUSEL
			}
			else
			{
				el.dataset.mode = DisplayMode.VIDEO;
				playVideo();
			}
		}


		const handleEnterPress = ()=>
		{

		}


		const handleSpacebarPress = ()=>
		{
			toggleVideoPlay();
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


		const playVideo = ()=> document.querySelector('video')?.play();
		const pauseVideo = ()=> document.querySelector('video')?.pause();


		const addEventHandlers = ()=>
		{
			document.addEventListener('keyup', e=>
			{
				if(
					e.key !== 'Enter' &&
					e.key !== 'ArrowUp' &&
					e.key !== 'ArrowRight' &&
					e.key !== 'ArrowLeft' &&
					e.key !== ' '
				)
					return;

				e.preventDefault();

				e.key === 'Enter' && handleEnterPress();
				e.key === 'ArrowUp' && toggleMode();
				e.key === 'ArrowRight' && advanceSlideshow();
				e.key === 'ArrowLeft' && rewindSlideshow();
				e.key === ' ' && handleSpacebarPress();

			})
		}


		initCarousel();
		addEventHandlers();
	}
)();
